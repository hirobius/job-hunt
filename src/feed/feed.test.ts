import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildFeed,
  countSources,
  filterCounts,
  filterRows,
  newTodayLine,
  sortRows,
  type FeedRow,
} from './feed';
import { profileFrom, sourcesFrom, type SearchProfile, type Source } from './profile';
import {
  decide,
  getAllDecided,
  mergeDecided,
  muteCompany,
  noteSeen,
  postingFingerprint,
  readSeen,
  sanitizeDecided,
  undecide,
  type DecidedState,
} from './decided';
import type { Posting } from './types';
import type { FeedResult } from './fetchFeed';

beforeEach(() => localStorage.clear());

const NOW = Date.parse('2026-10-28T12:00:00');
const p = (id: string, title: string, company: string, extra: Partial<Posting> = {}): Posting => ({
  id,
  source: 'greenhouse',
  title,
  company,
  url: `https://boards.greenhouse.io/${company.toLowerCase()}/jobs/${id}`,
  location: 'Remote',
  mode: 'remote',
  text: '',
  ...extra,
});

const phraseProfile: SearchProfile = profileFrom({
  atsRoles: [],
  seniority: 'any',
  sweep: { titles: ['Product Designer'], off: [] },
  include: { terms: [], atsOff: [] },
  where: '',
  mode: 'any',
});
const none: DecidedState = { decided: [], muted: [], followed: [] };
const read = (postings: Posting[]): FeedResult => ({
  postings,
  sources: [{ key: 'greenhouse:acme', label: 'Acme', fetched: postings.length }],
});
const build = (
  postings: Posting[],
  o: Partial<{ decided: DecidedState; seen: Record<string, string>; saved: Set<string> }> = {},
  sources: Source[] = [],
  profile = phraseProfile,
) =>
  buildFeed(read(postings), profile, sources, {
    now: NOW,
    decided: o.decided ?? none,
    seen: o.seen ?? {},
    saved: o.saved ?? new Set(),
  });

describe('buildFeed', () => {
  const a1 = p('1', 'Product Designer', 'Acme');
  const a2 = p('2', 'Senior Product Designer, Growth', 'Acme');
  const b1 = p('3', 'Product Designer', 'Beta');

  it('Skip hides only that posting, never its company', () => {
    decide(a1, 'skipped');
    const view = build([a1, a2, b1], { decided: getAllDecided() });
    expect(view.rows.map((r) => r.id)).toEqual(expect.arrayContaining(['2', '3']));
    expect(view.rows.map((r) => r.id)).not.toContain('1');
    expect(view.hidden.decided).toBe(1);
    undecide(a1);
    expect(build([a1, a2, b1], { decided: getAllDecided() }).rows).toHaveLength(3);
  });

  it('Not this company hides every posting from it, and a muted board too', () => {
    muteCompany('acme');
    const view = build([a1, a2, b1], { decided: getAllDecided() });
    expect(view.rows.map((r) => r.company)).toEqual(['Beta']);
    expect(view.hidden.muted).toBe(2);
    const muted: Source = {
      kind: 'board',
      ref: 'https://boards.greenhouse.io/beta',
      label: 'Beta',
      muted: true,
    };
    expect(build([a1, b1], {}, [muted]).rows.map((r) => r.company)).toEqual(['Acme']);
  });

  it('leaves out jobs already saved', () => {
    const view = build([a1, b1], { saved: new Set(['boards.greenhouse.io/acme/jobs/1']) });
    expect(view.rows.map((r) => r.id)).toEqual(['3']);
    expect(view.hidden.saved).toBe(1);
  });

  it('marks what was first seen today and counts it', () => {
    const fp = postingFingerprint(a1);
    const view = build([a1, b1], { seen: { [fp]: '2026-10-20' } });
    expect(view.rows.find((r) => r.id === '1')?.isNew).toBe(false);
    expect(view.rows.find((r) => r.id === '3')?.isNew).toBe(true);
    expect(view.newToday).toBe(1);
  });

  it('keeps one row per posting across sources', () => {
    const copy = p('9', 'Product Designer', 'Acme', { source: 'hn', url: 'https://x.test/a' });
    expect(build([a1, copy]).rows).toHaveLength(1);
  });

  it('a scored profile lists the queue in Browse and keeps Review apart, with reasons', () => {
    const ds = profileFrom({
      atsRoles: [],
      seniority: 'any',
      sweep: { titles: ['Design Systems Engineer'], off: [] },
      include: { terms: ['design systems'], atsOff: [] },
      where: '',
      mode: 'any',
    });
    const q = p('1', 'Design Systems Engineer', 'Acme', { text: 'design tokens' });
    const r = p('2', 'UX Engineer', 'Beta', { text: 'design system work' });
    const view = build([q, r], {}, [], ds);
    expect(view.rows.map((x) => x.id)).toEqual(['1']);
    expect(view.rows[0].reasons).toMatch(/^Queued because/);
    expect(view.review.map((x) => x.id)).toEqual(['2']);
    // The related title rides in the profile's titles, so the sweep searches for it.
    expect(ds.titles).toContain('Design Technologist');
  });
});

describe('sources', () => {
  it('one entry per board and company, dreams as stars, then the feeds', () => {
    const s = sourcesFrom({
      tileUrls: ['https://jobs.ashbyhq.com/ramp', 'https://jobs.ashbyhq.com/Ramp/123'],
      dreams: [
        {
          key: 'ramp',
          company: 'Ramp',
          board: { kind: 'ashby', slug: 'ramp' },
          seen: [],
          starredAt: '',
        },
        { key: 'figma', company: 'Figma', seen: [], starredAt: '' },
      ],
      targets: [],
      muted: ['figma'],
      followed: ['orbit'],
    });
    expect(s.filter((x) => x.kind === 'board')).toEqual([
      { kind: 'board', ref: 'https://jobs.ashbyhq.com/ramp', label: 'Ramp', star: true },
    ]);
    expect(s.filter((x) => x.kind === 'company')).toEqual([
      { kind: 'company', ref: 'figma', label: 'Figma', star: true, muted: true },
      { kind: 'company', ref: 'orbit', label: 'orbit' },
    ]);
    expect(s.filter((x) => x.kind === 'feed').map((x) => x.ref)).toEqual([
      'hn',
      'remotive',
      'jobicy',
    ]);
  });

  it('counts each board and each feed once, whatever the terms', () => {
    expect(
      countSources([
        { key: 'hn|a', label: '', fetched: 1 },
        { key: 'hn|b', label: '', fetched: 1 },
        { key: 'remotive|a', label: '', fetched: 0, error: 'x' },
        { key: 'remotive|b', label: '', fetched: 2 },
        { key: 'jobicy|a', label: '', fetched: 0, error: 'down' },
        { key: 'ashby:ramp', label: '', fetched: 3 },
      ]),
    ).toEqual({ read: 3, failed: [{ key: 'jobicy|a', label: '', fetched: 0, error: 'down' }] });
    expect(newTodayLine(4, 9)).toBe('4 new today from 9 sources');
    expect(newTodayLine(0, 1)).toBe('Nothing new today from 1 source');
  });
});

describe('Browse sort and filter', () => {
  const row = (id: string, o: Partial<FeedRow>): FeedRow =>
    ({
      ...p(id, 'Designer', 'X'),
      score: 0,
      hit: 'title',
      snippet: '',
      titles: [],
      signals: [],
      fingerprint: id,
      firstSeen: '2026-10-28',
      isNew: false,
      rank: 0,
      ...o,
    }) as FeedRow;
  const rows = [
    row('a', { rank: 5, company: 'Zed', postedAt: '2026-10-20' }),
    row('b', { rank: 9, company: 'acme', postedAt: '2026-10-01', isNew: true }),
    row('c', {
      rank: 7,
      company: 'Beta',
      postedAt: '2026-10-27',
      mode: 'hybrid',
      signals: [{ id: 'contract', label: 'Contract', evidence: '' }],
    }),
  ];

  it.each([
    ['score', ['b', 'c', 'a']],
    ['newest', ['c', 'a', 'b']],
    ['company', ['b', 'c', 'a']],
  ] as const)('sorts by %s', (by, ids) => {
    expect(sortRows(rows, by).map((r) => r.id)).toEqual(ids);
  });

  it('filters by every chip that is on, and counts each', () => {
    expect(filterRows(rows, ['new']).map((r) => r.id)).toEqual(['b']);
    expect(filterRows(rows, ['remote']).map((r) => r.id)).toEqual(['a', 'b']);
    expect(filterRows(rows, ['remote', 'contract'])).toEqual([]);
    expect(filterCounts(rows)).toEqual({ new: 1, contract: 1, founding: 0, remote: 2 });
  });
});

describe('decided store', () => {
  it('is untrusted on read and merges by posting, newest verdict winning', () => {
    expect(
      sanitizeDecided({ decided: [{ fingerprint: 'x', verdict: 'nope' }, 3], muted: [1, 'A '] }),
    ).toEqual({
      decided: [],
      muted: ['A'],
      followed: [],
    });
    const local = {
      decided: [{ fingerprint: 'x', verdict: 'skipped' as const, at: '2026-10-02' }],
      muted: [],
      followed: [],
    };
    const cloud = {
      decided: [{ fingerprint: 'x', verdict: 'saved' as const, at: '2026-10-01' }],
      muted: ['m'],
      followed: [],
    };
    expect(mergeDecided(cloud, local)).toEqual({
      decided: local.decided,
      muted: ['m'],
      followed: [],
    });
  });

  it('notes a first-seen day once', () => {
    noteSeen(['a'], Date.parse('2026-10-01T12:00:00'));
    noteSeen(['a', 'b'], NOW);
    expect(readSeen()).toEqual({ a: '2026-10-01', b: '2026-10-28' });
  });
});
