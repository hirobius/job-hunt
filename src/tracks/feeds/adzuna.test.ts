import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  adzunaUrl,
  ADZUNA_COUNTRIES,
  ADZUNA_PHRASES,
  CALL_GAP_MS,
  parseAdzuna,
  readAdzuna,
} from './adzuna';
import { MissingKeyError, type FeedContext } from './context';

const FIXTURE = JSON.parse(readFileSync('src/tracks/feeds/fixtures/adzuna-search.json', 'utf8'));
const KEYS: Record<string, string> = { ADZUNA_APP_ID: 'app-id', ADZUNA_APP_KEY: 'app-key' };
const ctx = (o: Partial<FeedContext> = {}): FeedContext => ({
  fetch: vi.fn(async () => new Response(JSON.stringify(FIXTURE))),
  env: (n) => KEYS[n],
  now: () => new Date('2026-10-29T06:00:00Z'),
  sleep: vi.fn(async () => {}),
  ...o,
});

describe('Adzuna', () => {
  it('maps results through their redirect link, highlights stripped', () => {
    const [a, b, ...rest] = parseAdzuna(FIXTURE);
    expect(rest).toEqual([]);
    expect(a).toEqual({
      source: 'adzuna',
      sourceId: 'adzuna:4921837465',
      title: 'Senior Design Systems Engineer - Remote',
      company: 'Acme',
      location: 'New York City, New York',
      remote: true,
      url: 'https://www.adzuna.com/land/ad/4921837465?se=abc&utm_medium=api',
      descriptionText: 'We are looking for an engineer to own our design system…',
      postedAt: '2026-10-26T14:03:11.000Z',
    });
    expect(b).toMatchObject({ sourceId: 'adzuna:4921837999', company: '', location: 'London, UK' });
    expect(b.remote).toBeUndefined();
    expect(b.postedAt).toBeUndefined();
    expect(parseAdzuna({ results: 'x' })).toEqual([]);
  });

  it('asks each country for each phrase, spaced under 25 a minute, deduped by id', async () => {
    const c = ctx();
    const out = await readAdzuna(c);
    expect(out).toHaveLength(2);
    const calls = (c.fetch as ReturnType<typeof vi.fn>).mock.calls.map((x) => x[0] as string);
    expect(calls).toHaveLength(ADZUNA_COUNTRIES.length * ADZUNA_PHRASES.length);
    expect(calls[0]).toBe(adzunaUrl('us', 'design system', 'app-id', 'app-key'));
    expect(new URL(calls[0]).searchParams.get('what_phrase')).toBe('design system');
    expect(c.sleep).toHaveBeenCalledTimes(calls.length - 1);
    expect(60_000 / CALL_GAP_MS).toBeLessThanOrEqual(25);
  });

  it('fails loud naming the first unset env var', async () => {
    const c = ctx({ env: (n) => (n === 'ADZUNA_APP_ID' ? 'x' : undefined) });
    const err = await readAdzuna(c).catch((e: Error) => e);
    expect(err).toBeInstanceOf(MissingKeyError);
    expect(String(err)).toMatch(/ADZUNA_APP_KEY is not set/);
    expect(c.fetch).not.toHaveBeenCalled();
  });

  it('a refused call fails the read without the keys in the message', async () => {
    const c = ctx({ fetch: vi.fn(async () => new Response('', { status: 401 })) });
    const err = String(await readAdzuna(c).catch((e: Error) => e));
    expect(err).toMatch(/Adzuna us: HTTP 401/);
    expect(err).not.toMatch(/app-key|app-id/);
  });
});
