import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { FeedContext } from './context';
import { getOnBrdUrl, parseGetOnBrd, readGetOnBrd } from './getonbrd';

const raw = (f: string) => readFileSync(`src/postingSync/feeds/fixtures/${f}`, 'utf8');
const json = (f: string) => JSON.parse(raw(f)) as unknown;
const ctx = (body: string, o: Partial<FeedContext> = {}): FeedContext => ({
  fetch: vi.fn(async () => new Response(body)),
  env: () => undefined,
  now: () => new Date('2026-11-17T06:23:00Z'),
  sleep: vi.fn(async () => {}),
  ...o,
});

describe('Get on Board', () => {
  it('reads the JSON:API rows, the public URL and the countries', () => {
    expect(parseGetOnBrd(json('getonbrd-search.json'))).toEqual([
      {
        source: 'getonbrd',
        sourceId: 'getonbrd:design-systems-engineer-eta-remote',
        title: 'Design Systems Engineer',
        company: 'Eta',
        location: 'Chile, Mexico',
        remote: true,
        url: 'https://www.getonbrd.com/jobs/design-systems-engineer-eta-remote',
        descriptionText: expect.stringContaining('Build our component library.'),
        postedAt: '2026-11-15T00:00:00.000Z',
      },
    ]);
    expect(new URL(getOnBrdUrl('design system')).searchParams.get('expand')).toBe('["company"]');
  });

  it('reads both phrases', async () => {
    const c = ctx(raw('getonbrd-search.json'));
    expect(await readGetOnBrd(c)).toHaveLength(1);
    expect(c.fetch).toHaveBeenCalledTimes(2);
  });
});
