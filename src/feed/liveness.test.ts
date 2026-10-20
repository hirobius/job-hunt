import { describe, expect, it, vi } from 'vitest';
import type { Job } from '../types';
import { dedupKey } from '../store';
import { FetchError, type FetchJson } from './sources/http';
import {
  boardOfJobUrl,
  checkLive,
  dueJobs,
  eligibleJobs,
  sanitizeLiveness,
  type LiveCheck,
} from './liveness';

const job = (url: string, status: Job['status'] = 'Saved'): Job => ({ url, label: url, status });
const NOW = Date.parse('2026-10-15T12:00:00Z');
const HOUR = 3600e3;
const k = dedupKey;

describe('boardOfJobUrl', () => {
  it.each([
    ['https://boards.greenhouse.io/figma/jobs/4012345', 'greenhouse', 'figma', '4012345'],
    ['https://job-boards.greenhouse.io/acme/jobs/99?gh_src=x', 'greenhouse', 'acme', '99'],
    [
      'https://jobs.lever.co/plaid/6ed76ce8-4156-4a1b-9c1d-0123456789ab',
      'lever',
      'plaid',
      '6ed76ce8-4156-4a1b-9c1d-0123456789ab',
    ],
    [
      'https://jobs.lever.co/plaid/6ed76ce8-4156-4a1b-9c1d-0123456789ab/apply',
      'lever',
      'plaid',
      '6ed76ce8-4156-4a1b-9c1d-0123456789ab',
    ],
    [
      'https://jobs.ashbyhq.com/ramp/34413f8d-aaaa-bbbb-cccc-111122223333',
      'ashby',
      'ramp',
      '34413f8d-aaaa-bbbb-cccc-111122223333',
    ],
  ])('%s', (url, kind, slug, ref) => {
    const r = boardOfJobUrl(url)!;
    expect(r.board).toMatchObject({ kind, slug });
    expect(r.ref).toBe(ref);
  });

  it.each([
    'https://jobs.ashbyhq.com/ramp', // the board itself, not a job
    'https://boards.greenhouse.io/figma',
    'https://www.linkedin.com/jobs/view/123',
    'https://acme.example/careers/1',
    'not a url',
  ])('is null for %s', (url) => {
    expect(boardOfJobUrl(url)).toBeNull();
  });
});

describe('eligibleJobs', () => {
  it('keeps Saved and Applied board jobs; skips other sites, other statuses, archived', () => {
    const jobs = [
      job('https://jobs.ashbyhq.com/ramp/aaaa'),
      job('https://jobs.ashbyhq.com/ramp/bbbb', 'Applied'),
      job('https://jobs.ashbyhq.com/ramp/cccc', 'Rejected'),
      job('https://jobs.ashbyhq.com/ramp/dddd', 'Interviewing'),
      { ...job('https://jobs.ashbyhq.com/ramp/eeee'), archived: true },
      job('https://www.linkedin.com/jobs/view/1'),
    ];
    expect(eligibleJobs(jobs).map((j) => j.url)).toEqual([
      'https://jobs.ashbyhq.com/ramp/aaaa',
      'https://jobs.ashbyhq.com/ramp/bbbb',
    ]);
  });
});

const ASHBY_A = 'https://jobs.ashbyhq.com/ramp/aaaa-1111';
const ASHBY_B = 'https://jobs.ashbyhq.com/ramp/bbbb-2222';
const ashbyBoard = (...ids: string[]) => ({
  jobs: ids.map((id) => ({ id, title: 't', jobUrl: `https://jobs.ashbyhq.com/ramp/${id}` })),
});

describe('checkLive', () => {
  it('open when the posting is on the board, closed when a reachable board lacks it', async () => {
    const fetchJson: FetchJson = async () => ashbyBoard('aaaa-1111');
    const out = await checkLive([job(ASHBY_A), job(ASHBY_B)], fetchJson, NOW);
    expect(out.get(ASHBY_A)).toMatchObject({ state: 'open' });
    expect(out.get(ASHBY_B)).toMatchObject({ state: 'closed' });
    expect(out.get(ASHBY_A)!.checkedAt).toBe(new Date(NOW).toISOString());
  });

  it('is case-insensitive on the posting ref', async () => {
    const out = await checkLive(
      [job('https://jobs.ashbyhq.com/ramp/AAAA-1111')],
      async () => ashbyBoard('aaaa-1111'),
      NOW,
    );
    expect(out.get('https://jobs.ashbyhq.com/ramp/AAAA-1111')!.state).toBe('open');
  });

  it('reads Greenhouse ids and Lever uuids', async () => {
    const gh = 'https://boards.greenhouse.io/figma/jobs/77';
    const lv = 'https://jobs.lever.co/plaid/abc-123';
    const fetchJson: FetchJson = async (u) =>
      u.includes('greenhouse')
        ? { jobs: [{ id: 77, absolute_url: 'https://x.example/77', title: 't' }] }
        : [{ id: 'zzz', hostedUrl: 'https://jobs.lever.co/plaid/zzz', text: 't' }];
    const out = await checkLive([job(gh), job(lv)], fetchJson, NOW);
    expect(out.get(gh)!.state).toBe('open');
    expect(out.get(lv)!.state).toBe('closed');
  });

  it.each([
    ['a 500', () => new FetchError(500, 'u')],
    ['a timeout', () => new FetchError(0, 'u', true)],
    ['being offline', () => new FetchError(0, 'u')],
    ['a 429', () => new FetchError(429, 'u')],
  ])('never marks closed on %s', async (_n, err) => {
    const out = await checkLive([job(ASHBY_A)], async () => Promise.reject(err()), NOW);
    expect(out.get(ASHBY_A)!.state).toBe('unknown');
  });

  it('a 404 board is unknown with a "board moved" hint, not closed', async () => {
    const out = await checkLive(
      [job(ASHBY_A)],
      async () => Promise.reject(new FetchError(404, 'u')),
      NOW,
    );
    expect(out.get(ASHBY_A)).toMatchObject({ state: 'unknown' });
    expect(out.get(ASHBY_A)!.hint).toMatch(/moved/i);
  });

  it.each([
    ['empty body', null],
    ['a string', 'oops'],
    ['an object without jobs', { nope: 1 }],
  ])('unknown for %s', async (_n, body) => {
    const out = await checkLive([job(ASHBY_A)], async () => body, NOW);
    expect(out.get(ASHBY_A)!.state).toBe('unknown');
  });

  it('a valid but empty board means closed', async () => {
    const out = await checkLive([job(ASHBY_A)], async () => ({ jobs: [] }), NOW);
    expect(out.get(ASHBY_A)!.state).toBe('closed');
  });

  it('fetches each board once for ten jobs', async () => {
    const fetchJson = vi.fn(async () => ashbyBoard('a0'));
    const jobs = Array.from({ length: 10 }, (_, i) => job(`https://jobs.ashbyhq.com/ramp/a${i}`));
    await checkLive(jobs, fetchJson, NOW);
    expect(fetchJson).toHaveBeenCalledTimes(1);
  });

  it('one failing board does not blank the others', async () => {
    const lv = 'https://jobs.lever.co/plaid/abc';
    const fetchJson: FetchJson = async (u) => {
      if (u.includes('ashby')) throw new FetchError(500, u);
      return [{ id: 'abc', hostedUrl: lv, text: 't' }];
    };
    const out = await checkLive([job(ASHBY_A), job(lv)], fetchJson, NOW);
    expect(out.get(ASHBY_A)!.state).toBe('unknown');
    expect(out.get(lv)!.state).toBe('open');
  });

  it('skips jobs that are not on a board: they get no entry at all', async () => {
    const fetchJson = vi.fn();
    const out = await checkLive([job('https://www.linkedin.com/jobs/view/1')], fetchJson, NOW);
    expect(out.size).toBe(0);
    expect(fetchJson).not.toHaveBeenCalled();
  });
});

describe('dueJobs (the 6 hour rule)', () => {
  const stored = (state: LiveCheck['state'], ageH: number): LiveCheck => ({
    state,
    checkedAt: new Date(NOW - ageH * HOUR).toISOString(),
  });
  const jobs = [job(ASHBY_A), job(ASHBY_B)];

  it('checks never-checked jobs', () => {
    expect(dueJobs(jobs, {}, NOW)).toHaveLength(2);
  });
  it('skips jobs checked under 6 hours ago', () => {
    expect(
      dueJobs(jobs, { [k(ASHBY_A)]: stored('open', 5), [k(ASHBY_B)]: stored('closed', 1) }, NOW),
    ).toEqual([]);
  });
  it('re-checks after 6 hours, and always re-checks unknown ones', () => {
    const s = { [k(ASHBY_A)]: stored('open', 7), [k(ASHBY_B)]: stored('unknown', 1) };
    expect(dueJobs(jobs, s, NOW).map((j) => j.url)).toEqual([ASHBY_A, ASHBY_B]);
  });
  it('force ignores the cache', () => {
    expect(dueJobs(jobs, { [k(ASHBY_A)]: stored('open', 0) }, NOW, true)).toHaveLength(2);
  });
});

describe('sanitizeLiveness (corrupt storage)', () => {
  it('keeps well-formed entries and drops the rest', () => {
    const good = { state: 'closed', checkedAt: '2026-10-15T00:00:00.000Z' };
    expect(
      sanitizeLiveness({ a: good, b: { state: 'weird', checkedAt: 'x' }, c: 5, d: null }),
    ).toEqual({ a: good });
    expect(sanitizeLiveness('nope')).toEqual({});
    expect(sanitizeLiveness(null)).toEqual({});
    expect(sanitizeLiveness([1, 2])).toEqual({});
  });
});

describe('boardOfJobUrl: Workable and Recruitee', () => {
  it('extracts the posting ref', () => {
    expect(boardOfJobUrl('https://apply.workable.com/acme/j/ABC123/')).toMatchObject({
      board: { kind: 'workable', slug: 'acme' },
      ref: 'ABC123',
    });
    expect(boardOfJobUrl('https://acme.recruitee.com/o/ui-engineer')).toMatchObject({
      board: { kind: 'recruitee', slug: 'acme' },
      ref: 'ui-engineer',
    });
    expect(boardOfJobUrl('https://apply.workable.com/acme')).toBeNull();
    // #216: the numeric id, not the title slug after it.
    expect(
      boardOfJobUrl('https://jobs.smartrecruiters.com/Acme/744000012345678-design-engineer'),
    ).toMatchObject({ board: { kind: 'smartrecruiters', slug: 'Acme' }, ref: '744000012345678' });
    expect(boardOfJobUrl('https://acme.teamtailor.com/jobs/123-ui-engineer')).toMatchObject({
      board: { kind: 'teamtailor', slug: 'acme' },
      ref: '123',
    });
    expect(boardOfJobUrl('https://acme.jobs.personio.de/job/42?language=en')).toMatchObject({
      board: { kind: 'personio', slug: 'acme' },
      ref: '42',
    });
    expect(boardOfJobUrl('https://acme.teamtailor.com/jobs')).toBeNull();
    expect(boardOfJobUrl('https://acme.jobs.personio.de')).toBeNull();
    expect(boardOfJobUrl('https://acme.recruitee.com')).toBeNull();
  });

  it('checks a Recruitee job by its careers url, a Workable one by shortcode', async () => {
    const rc = 'https://acme.recruitee.com/o/ui-engineer';
    const wk = 'https://apply.workable.com/acme/j/ABC123/';
    const fetchJson: FetchJson = async (u) =>
      u.includes('recruitee')
        ? { offers: [{ id: 1, title: 't', careers_url: rc }] }
        : {
            jobs: [{ shortcode: 'zzz', title: 't', url: 'https://apply.workable.com/acme/j/zzz/' }],
          };
    const out = await checkLive([job(rc), job(wk)], fetchJson, NOW);
    expect(out.get(rc)!.state).toBe('open');
    expect(out.get(wk)!.state).toBe('closed');
  });
});
