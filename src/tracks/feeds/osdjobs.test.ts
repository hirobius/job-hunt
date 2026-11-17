import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { FeedContext } from './context';
import { OSDJOBS_URL, parseOsdJobs, readOsdJobs } from './osdjobs';

const raw = (f: string) => readFileSync(`src/tracks/feeds/fixtures/${f}`, 'utf8');
const ctx = (body: string, o: Partial<FeedContext> = {}): FeedContext => ({
  fetch: vi.fn(async () => new Response(body)),
  env: () => undefined,
  now: () => new Date('2026-11-17T06:23:00Z'),
  sleep: vi.fn(async () => {}),
  ...o,
});

describe('Open Source Design', () => {
  it('keeps design-system items from the RSS', async () => {
    const [a, ...rest] = parseOsdJobs(raw('osdjobs-feed.xml'));
    expect(rest).toEqual([]);
    expect(a).toMatchObject({
      source: 'osdjobs',
      title: 'Design system contributor for Penpot components (remote)',
      url: 'https://opensourcedesign.net/jobs/jobs/2026-11-10-penpot-design-system/',
      descriptionText: 'Help us grow the design system.',
      postedAt: '2026-11-10T00:00:00.000Z',
    });
    const c = ctx(raw('osdjobs-feed.xml'));
    await readOsdJobs(c);
    expect(vi.mocked(c.fetch).mock.calls[0]![0]).toBe(OSDJOBS_URL);
  });
});
