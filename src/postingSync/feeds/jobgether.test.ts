import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { FeedContext } from './context';
import { JOBGETHER_PHRASES, jobgetherUrl, parseJobgether, readJobgether } from './jobgether';

const raw = (f: string) => readFileSync(`src/postingSync/feeds/fixtures/${f}`, 'utf8');
const json = (f: string) => JSON.parse(raw(f)) as unknown;
const ctx = (body: string, o: Partial<FeedContext> = {}): FeedContext => ({
  fetch: vi.fn(async () => new Response(body)),
  env: () => undefined,
  now: () => new Date('2026-11-17T06:23:00Z'),
  sleep: vi.fn(async () => {}),
  ...o,
});

describe('Jobgether', () => {
  it('keeps design-systems roles, linked to the Jobgether offer', () => {
    expect(parseJobgether(json('jobgether-jobs.json'))).toEqual([
      expect.objectContaining({
        source: 'jobgether',
        sourceId: 'jobgether:jg-77',
        company: 'Epsilon',
        remote: true,
        url: 'https://jobgether.com/offer/jg-77-design-system-designer',
      }),
    ]);
  });

  it('fails only when every phrase fails', async () => {
    const c = ctx(raw('jobgether-jobs.json'));
    await readJobgether(c);
    expect(vi.mocked(c.fetch).mock.calls.map((x) => x[0])).toEqual(
      JOBGETHER_PHRASES.map(jobgetherUrl),
    );
    await expect(
      readJobgether(ctx('', { fetch: vi.fn(async () => new Response('', { status: 429 })) })),
    ).rejects.toThrow('Jobgether: HTTP 429');
  });
});
