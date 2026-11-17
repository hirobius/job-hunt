import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { FeedContext } from './context';
import {
  parseRemoteJobsOrg,
  readRemoteJobsOrg,
  REMOTEJOBSORG_PHRASES,
  remoteJobsOrgUrl,
} from './remotejobsorg';

const raw = (f: string) => readFileSync(`src/tracks/feeds/fixtures/${f}`, 'utf8');
const json = (f: string) => JSON.parse(raw(f)) as unknown;
const ctx = (body: string, o: Partial<FeedContext> = {}): FeedContext => ({
  fetch: vi.fn(async () => new Response(body)),
  env: () => undefined,
  now: () => new Date('2026-11-17T06:23:00Z'),
  sleep: vi.fn(async () => {}),
  ...o,
});

describe('RemoteJobs.org', () => {
  it('keeps the RemoteJobs.org link as given, and every row remote', () => {
    const [a, ...rest] = parseRemoteJobsOrg(json('remotejobsorg-jobs.json'));
    expect(rest).toEqual([]);
    expect(a).toMatchObject({
      source: 'remotejobsorg',
      sourceId: 'remotejobsorg:501',
      company: 'Gamma Remote',
      remote: true,
      url: 'https://remotejobs.org/jobs/501-senior-design-technologist',
      postedAt: '2026-11-15T12:00:00.000Z',
    });
  });

  it('asks each phrase once and dedupes', async () => {
    const c = ctx(raw('remotejobsorg-jobs.json'));
    expect(await readRemoteJobsOrg(c)).toHaveLength(1);
    expect(vi.mocked(c.fetch).mock.calls.map((x) => x[0])).toEqual(
      REMOTEJOBSORG_PHRASES.map(remoteJobsOrgUrl),
    );
  });
});
