import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { MissingKeyError, type FeedContext } from './context';
import {
  parseTheirStack,
  readTheirStack,
  THEIRSTACK_LIMIT,
  THEIRSTACK_MAX_AGE_DAYS,
  THEIRSTACK_URL,
  theirstackDue,
} from './theirstack';

const FIXTURE = JSON.parse(
  readFileSync('src/tracks/feeds/fixtures/theirstack-search.json', 'utf8'),
);
const DUE = new Date('2026-10-28T06:00:00Z');
const ctx = (o: Partial<FeedContext> = {}): FeedContext => ({
  fetch: vi.fn(async () => new Response(JSON.stringify(FIXTURE))),
  env: (n) => (n === 'THEIRSTACK_API_KEY' ? 'ts-key' : undefined),
  now: () => DUE,
  sleep: async () => {},
  ...o,
});

describe('TheirStack', () => {
  it('maps rows, preferring the ATS link, and drops rows with no id or web link', () => {
    const [a, b, ...rest] = parseTheirStack(FIXTURE);
    expect(rest).toEqual([]);
    expect(a).toEqual({
      source: 'theirstack',
      sourceId: 'theirstack:1866203412',
      title: 'Senior Design Systems Engineer',
      company: 'Acme Inc.',
      location: 'US',
      remote: true,
      url: 'https://job-boards.greenhouse.io/acme/jobs/7012345',
      descriptionText: 'Own our design system & tokens.',
      postedAt: '2026-10-27T00:00:00.000Z',
    });
    expect(b).toMatchObject({ company: 'Beta', url: 'https://example-board.com/jobs/88' });
    expect(b.remote).toBeUndefined();
    expect(b.postedAt).toBeUndefined();
    expect(parseTheirStack({})).toEqual([]);
  });

  it('is due 10 days a month, never two within 3 days, so 10 × LIMIT stays under 200 credits', () => {
    const days = Array.from({ length: 31 }, (_, i) => new Date(Date.UTC(2026, 0, i + 1)));
    const due = days.filter(theirstackDue).map((d) => d.getUTCDate());
    expect(due).toEqual([1, 4, 7, 10, 13, 16, 19, 22, 25, 28]);
    expect(due.length * THEIRSTACK_LIMIT).toBeLessThanOrEqual(180);
    // Each call's window reaches back to the one before, across a month end too (28th → 1st).
    const dueTimes = Array.from({ length: 400 }, (_, i) => new Date(Date.UTC(2026, 0, 1 + i)))
      .filter(theirstackDue)
      .map((d) => d.getTime());
    const gaps = dueTimes.slice(1).map((t, i) => (t - dueTimes[i]) / 86_400_000);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(THEIRSTACK_MAX_AGE_DAYS);
  });

  it('POSTs the title search with the bearer key on a due day', async () => {
    const c = ctx();
    const out = await readTheirStack(c);
    expect(out).toHaveLength(2);
    const [url, init] = (c.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe(THEIRSTACK_URL);
    expect(init.method).toBe('POST');
    expect(init.headers.authorization).toBe('Bearer ts-key');
    expect(JSON.parse(init.body)).toMatchObject({
      job_title_or: ['design system', 'design technologist'],
      remote: true,
      limit: THEIRSTACK_LIMIT,
      posted_at_max_age_days: 4,
    });
  });

  it('spends nothing on a day that is not due', async () => {
    const c = ctx({ now: () => new Date('2026-10-29T06:00:00Z') });
    expect(await readTheirStack(c)).toEqual([]);
    expect(c.fetch).not.toHaveBeenCalled();
  });

  it('fails loud, naming the env var, when the key is unset', async () => {
    const c = ctx({ env: () => '' });
    await expect(readTheirStack(c)).rejects.toThrow(MissingKeyError);
    await expect(readTheirStack(c)).rejects.toThrow(/^THEIRSTACK_API_KEY is not set/);
    expect(c.fetch).not.toHaveBeenCalled();
  });

  it('names the status, never the key, on a refusal', async () => {
    const c = ctx({ fetch: vi.fn(async () => new Response('', { status: 402 })) });
    const err = await readTheirStack(c).catch((e: Error) => e);
    expect(String(err)).toMatch(/TheirStack: HTTP 402/);
    expect(String(err)).not.toMatch(/ts-key/);
  });
});
