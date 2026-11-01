import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FIXTURE_BOARDS, fixtureFetch, rotationDryRun } from './rotationDryRun.ts';
import { toWatched } from './rotation.ts';
import { readAll } from './sync.ts';

// Recorded live answers (2026-10-30, trimmed: two roles a board, long text cut, emails scrubbed)
// from the three board kinds the rotation's set holds (src/feed/data/boards.json: Greenhouse,
// Lever, Ashby). See fixtures/README.md.
const read = (f: string) => readFileSync(`src/tracks/fixtures/${f}`, 'utf8');
const fetch = fixtureFetch(read);
const T0 = Date.parse('2026-10-30T07:00:00Z');

describe('the rotation readers on live answers', () => {
  const readBoard = async (kind: string) => {
    const b = FIXTURE_BOARDS.find((x) => x.kind === kind)!;
    const [r] = await readAll([toWatched(b)], { fetch, rss: false });
    expect(r.ok).toBe(true);
    return r.postings;
  };

  it('Greenhouse (content=true): HTML unescaped to text, first_published as posted, no remote flag', async () => {
    const [ds, other] = await readBoard('greenhouse');
    expect(ds).toMatchObject({
      source: 'greenhouse',
      sourceId: 'greenhouse:discord:8846330002',
      title: 'Senior Product Designer, Design Systems',
      company: 'Discord',
      location: 'San Francisco Bay Area',
      url: 'https://job-boards.greenhouse.io/discord/jobs/8846330002',
      postedAt: '2026-09-30T19:30:22-04:00',
    });
    expect(ds.remote).toBeUndefined();
    expect(ds.descriptionText).toMatch(/^Discord has a highly engaged community/);
    expect(ds.descriptionText).not.toMatch(/&lt;|<p>/);
    expect(other.title).toBe('Commercial Policy Lead');
  });

  it('Lever: workplaceType sets remote, createdAt (ms) becomes ISO, hosted URL kept', async () => {
    const [design, sales] = await readBoard('lever');
    expect(design).toMatchObject({
      source: 'lever',
      title: 'Staff Product Designer - Platform Design',
      location: 'London',
      remote: true,
      url: 'https://jobs.lever.co/spotify/f02fb195-ba10-40bd-a926-0318a34a7fae',
      postedAt: '2026-10-21T17:27:06.994Z',
    });
    expect(design.descriptionText).toMatch(/^Commitment: Permanent/);
    expect(sales).toMatchObject({ location: 'New York, NY', remote: false });
  });

  it('Ashby: isRemote sets remote, publishedAt as posted, jobUrl kept', async () => {
    const [designer, engineer] = await readBoard('ashby');
    expect(designer).toMatchObject({
      source: 'ashby',
      sourceId: 'ashby:linear:a264869e-f058-487c-ab7f-9b77dffa427c',
      title: 'Senior / Staff Product Designer',
      location: 'North America',
      remote: true,
      url: 'https://jobs.ashbyhq.com/linear/a264869e-f058-487c-ab7f-9b77dffa427c',
      postedAt: '2026-04-23T21:39:39.618+00:00',
    });
    expect(engineer).toMatchObject({ location: 'Europe', remote: true });
  });
});

describe('npm run sync:dry-run -- --rotate --fixtures', () => {
  it('plans, reads, scores and keeps only remote design-system roles; the cursor passes the batch', async () => {
    const r = await rotationDryRun({ boards: FIXTURE_BOARDS, now: () => T0, fetch, math: false });
    expect(r.results?.map((x) => [x.key, x.result])).toEqual([
      ['lever:spotify', 'ok'],
      ['greenhouse:discord', 'ok'],
      ['ashby:linear', 'ok'],
    ]);
    expect(r.scored).toBe(6);
    // Discord's design systems role scores queue but names a city with no remote flag: not kept.
    expect(r.kept).toEqual(['Staff Product Designer - Platform Design']);
    expect(r.cursor).toBe('f0742274|ashby:linear');
    expect(r.lines.join('\n')).toContain('6 postings scored, 1 kept');
  });

  it('a board that answers 404 reads as gone, the rest still read', async () => {
    const boards = [
      ...FIXTURE_BOARDS,
      {
        kind: 'greenhouse' as const,
        slug: 'no-such-board',
        company: 'Nobody',
        jobs: 1,
        lastChecked: '2026-10-30',
        evidence: 'test',
      },
    ];
    const r = await rotationDryRun({ boards, now: () => T0, fetch, math: false });
    const byKey = Object.fromEntries((r.results ?? []).map((x) => [x.key, x]));
    expect(byKey['greenhouse:no-such-board']).toMatchObject({ result: 'gone', status: 404 });
    expect(byKey['ashby:linear'].result).toBe('ok');
    expect(r.kept).toEqual(['Staff Product Designer - Platform Design']);
  });

  it('without a fetch it only plans (no reads)', async () => {
    const r = await rotationDryRun({ boards: FIXTURE_BOARDS, now: () => T0, math: false });
    expect(r.results).toBeUndefined();
    expect(r.lines[3]).toBe("Next batch (cycle 0, after ''): 3 boards, 6 roles");
  });
});
