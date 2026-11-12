import { describe, expect, it } from 'vitest';
import { checkAggregatorLiveness, jobOnBoard, MAX_LIVENESS_BOARDS } from './aggregatorLiveness.ts';

const GH = 'https://boards-api.greenhouse.io/v1/boards/acme/jobs';
const LEVER = 'https://api.lever.co/v0/postings/lev?mode=json';
const ASHBY = 'https://api.ashbyhq.com/posting-api/job-board/ash';
const U1 = '11111111-aaaa-bbbb-cccc-000000000001';
const U2 = '11111111-aaaa-bbbb-cccc-000000000002';

type Answer = number | unknown;
/** A fetch that answers by URL (a number is a status with no body); records every URL asked. */
function fakeFetch(answers: Record<string, Answer | Answer[]>) {
  const asked: string[] = [];
  const f = async (url: string) => {
    asked.push(url);
    const a = answers[url];
    const one = Array.isArray(a) && typeof a[0] === 'number' ? (a as Answer[]).shift() : a;
    if (one === undefined) throw new Error(`unexpected ${url}`);
    if (typeof one === 'number') return new Response(null, { status: one });
    return new Response(JSON.stringify(one), { status: 200 });
  };
  return { f, asked };
}
const noWait = async () => {};

describe('jobOnBoard', () => {
  it('reads the board and job id from checked board links', () => {
    expect(jobOnBoard('https://boards.greenhouse.io/Acme/jobs/123')).toEqual({
      kind: 'greenhouse',
      slug: 'Acme',
      jobId: '123',
    });
    expect(jobOnBoard('https://job-boards.greenhouse.io/acme/jobs/45?gh_src=x')?.jobId).toBe('45');
    expect(jobOnBoard(`https://jobs.lever.co/lev/${U1}/apply`)?.jobId).toBe(U1);
    expect(jobOnBoard(`https://jobs.ashbyhq.com/ash/${U1}/application`)?.kind).toBe('ashby');
  });
  it('leaves out anything it cannot check', () => {
    expect(jobOnBoard('https://boards.greenhouse.io/acme')).toBeNull(); // no job id
    expect(jobOnBoard(`https://jobs.eu.lever.co/lev/${U1}`)).toBeNull(); // EU host off the guard
    expect(jobOnBoard('https://apply.workable.com/acme/j/ABC/')).toBeNull();
    expect(jobOnBoard('https://www.adzuna.com/land/ad/1')).toBeNull();
    expect(jobOnBoard('not a url')).toBeNull();
  });
});

describe('checkAggregatorLiveness', () => {
  it('closes a job its board no longer lists, keeps the listed ones', async () => {
    const { f, asked } = fakeFetch({
      [GH]: { jobs: [{ id: 123, absolute_url: 'https://boards.greenhouse.io/acme/jobs/123' }] },
      [LEVER]: [{ id: U1, hostedUrl: `https://jobs.lever.co/lev/${U1}` }],
    });
    const r = await checkAggregatorLiveness(
      [
        { id: 'a', url: 'https://boards.greenhouse.io/acme/jobs/123' },
        { id: 'b', url: 'https://boards.greenhouse.io/acme/jobs/999' },
        { id: 'c', url: `https://jobs.lever.co/lev/${U1}` },
        { id: 'd', url: `https://jobs.lever.co/lev/${U2}` },
        { id: 'e', url: 'https://www.adzuna.com/land/ad/1' },
      ],
      { fetch: f, wait: noWait },
    );
    expect(r.gone.sort()).toEqual(['b', 'd']);
    expect(r.failed).toEqual([]);
    // One read per board, on the fixed API hosts only.
    expect(asked.sort()).toEqual([GH, LEVER].sort());
  });

  it('a 404 board closes its jobs; a failure or a body with no list closes nothing', async () => {
    const { f } = fakeFetch({ [GH]: 404, [LEVER]: [500, 503], [ASHBY]: { nope: true } });
    const r = await checkAggregatorLiveness(
      [
        { id: 'a', url: 'https://boards.greenhouse.io/acme/jobs/1' },
        { id: 'b', url: `https://jobs.lever.co/lev/${U1}` },
        { id: 'c', url: `https://jobs.ashbyhq.com/ash/${U1}` },
      ],
      { fetch: f, wait: noWait },
    );
    expect(r.gone).toEqual(['a']);
    expect(r.failed.map((x) => x.board).sort()).toEqual(['ashby:ash', 'lever:lev']);
  });

  it('retries a 5xx once (retry.ts) and trusts the second answer', async () => {
    let calls = 0;
    const r = await checkAggregatorLiveness([{ id: 'b', url: `https://jobs.lever.co/lev/${U1}` }], {
      fetch: async () =>
        ++calls === 1
          ? new Response(null, { status: 503 })
          : new Response(
              JSON.stringify([{ id: U2, hostedUrl: `https://jobs.lever.co/lev/${U2}` }]),
              {
                status: 200,
              },
            ),
      wait: noWait,
    });
    expect(calls).toBe(2);
    expect(r.gone).toEqual(['b']);
    expect(r.failed).toEqual([]);
  });

  it('a thrown fetch (timeout) is unknown, never gone', async () => {
    const r = await checkAggregatorLiveness(
      [{ id: 'a', url: 'https://boards.greenhouse.io/acme/jobs/1' }],
      {
        fetch: async () => {
          throw new Error('The signal has been aborted: timeout');
        },
        wait: noWait,
      },
    );
    expect(r.gone).toEqual([]);
    expect(r.failed).toHaveLength(1);
  });

  it('a redirect off the host is refused (SSRF guard), closing nothing', async () => {
    const r = await checkAggregatorLiveness(
      [{ id: 'a', url: 'https://boards.greenhouse.io/acme/jobs/1' }],
      { fetch: async () => new Response(null, { status: 302 }), wait: noWait },
    );
    expect(r.gone).toEqual([]);
    expect(r.failed).toHaveLength(1);
  });

  it('reads at most MAX_LIVENESS_BOARDS boards a run', async () => {
    const asked: string[] = [];
    const rows = Array.from({ length: MAX_LIVENESS_BOARDS + 5 }, (_, i) => ({
      id: String(i),
      url: `https://boards.greenhouse.io/co${i}/jobs/1`,
    }));
    const r = await checkAggregatorLiveness(rows, {
      fetch: async (u) => {
        asked.push(u);
        return new Response(
          JSON.stringify({
            jobs: [{ id: 2, absolute_url: 'https://boards.greenhouse.io/co/jobs/2' }],
          }),
          {
            status: 200,
          },
        );
      },
      wait: noWait,
      seed: 'run-1',
    });
    expect(r.boards).toBe(MAX_LIVENESS_BOARDS);
    expect(asked).toHaveLength(MAX_LIVENESS_BOARDS);
    expect(r.gone).toHaveLength(MAX_LIVENESS_BOARDS);
  });

  it('an empty job list closes nothing (#673)', async () => {
    const { f } = fakeFetch({ [GH]: { jobs: [] }, [LEVER]: [], [ASHBY]: { jobs: [] } });
    const r = await checkAggregatorLiveness(
      [
        { id: 'a', url: 'https://boards.greenhouse.io/acme/jobs/1' },
        { id: 'b', url: `https://jobs.lever.co/lev/${U1}` },
        { id: 'c', url: `https://jobs.ashbyhq.com/ash/${U1}` },
      ],
      { fetch: f, wait: noWait },
    );
    expect(r.gone).toEqual([]);
    expect(r.failed).toHaveLength(3);
  });

  it('keeps the slug case in the request, groups boards ignoring case (#673)', async () => {
    const MixedAshby = 'https://api.ashbyhq.com/posting-api/job-board/AshCo';
    const { f, asked } = fakeFetch({
      [MixedAshby]: { jobs: [{ id: U1, jobUrl: `https://jobs.ashbyhq.com/AshCo/${U1}` }] },
    });
    const r = await checkAggregatorLiveness(
      [
        { id: 'a', url: `https://jobs.ashbyhq.com/AshCo/${U1}` },
        { id: 'b', url: `https://jobs.ashbyhq.com/ashco/${U2}` },
      ],
      { fetch: f, wait: noWait },
    );
    expect(asked).toEqual([MixedAshby]);
    expect(r.gone).toEqual(['b']);
  });

  it('a list whose ids are not the kind format closes nothing; unparsable rows are skipped', async () => {
    const { f } = fakeFetch({ [LEVER]: [{ id: 'not-a-uuid', hostedUrl: 'x' }] });
    const r = await checkAggregatorLiveness(
      [
        { id: 'b', url: `https://jobs.lever.co/lev/${U1}` },
        { id: 'z', url: 'https://jobs.lever.co/lev/abcdef12' }, // not a UUID: skipped
      ],
      { fetch: f, wait: noWait },
    );
    expect(r.gone).toEqual([]);
    expect(r.failed).toHaveLength(1);
    expect(jobOnBoard('https://jobs.lever.co/lev/abcdef12')).toBeNull();
  });
});
