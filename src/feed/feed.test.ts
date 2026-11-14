import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildFeed,
  countSources,
  filterCounts,
  filterRows,
  LAST_READ_KEY,
  LAST_READ_MAX,
  LAST_READ_TEXT_MAX,
  loadLastRead,
  saveLastRead,
  newTodayLine,
  payLabel,
  whyLine,
  sortRows,
  type FeedRow,
} from './feed';
import {
  designSystemRule,
  profileFrom,
  sourcesFrom,
  type SearchProfile,
  type Source,
} from './profile';
import {
  decide,
  followCompany,
  getAllDecided,
  muteCompany,
  noteSeen,
  postingFingerprint,
  readSeen,
  undecide,
  unmuteCompany,
  type DecidedState,
} from './decided';
import type { Posting } from './types';
import { getDecided, moveLegacyDecided } from '../decided';
import { getSources, replaceSources } from '../sources';
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
  const a1 = p('1', 'Design Systems Designer', 'Acme');
  const a2 = p('2', 'Design Systems Engineer, Web', 'Acme');
  const b1 = p('3', 'Design Systems Designer', 'Beta');

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
    const copy = p('9', 'Design Systems Designer', 'Acme', {
      source: 'hn',
      url: 'https://x.test/a',
    });
    expect(build([a1, copy]).rows).toHaveLength(1);
  });

  it('lists every design-system posting, newest first, with no fit tiers', () => {
    const old = p('1', 'Design Systems Engineer', 'Acme', { postedAt: '2026-10-01' });
    const tech = p('2', 'Design Technologist', 'Beta', { postedAt: '2026-10-20' });
    const mid = p('3', 'Senior Designer, Design System', 'Kite', { postedAt: '2026-10-10' });
    const other = p('4', 'Product Designer', 'Quill', { postedAt: '2026-10-27' });
    const body = p('5', 'Frontend Platform Engineer', 'Orbit', { text: 'our design system' });
    const view = build([old, tech, mid, other, body]);
    expect(view.rows.map((x) => x.id)).toEqual(['2', '3', '1']);
    expect(view.hidden.include).toBe(2);
    expect(view.rows.find((x) => x.id === '2')?.why).toBe('Related title');
    expect(view.rows.find((x) => x.id === '1')?.why).toBe('Design-system title');
    // Related titles ride in the profile's titles, so the sweep searches for them.
    expect(phraseProfile.titles).toContain('Design Technologist');
  });

  it('keeps the track’s own design system phrase and its related-title switch', () => {
    expect(
      designSystemRule({ terms: ['design systems', 'figma'], atsOff: ['x'], related: false }),
    ).toEqual({
      terms: ['design systems'],
      atsOff: [],
      related: false,
    });
    expect(designSystemRule({ terms: [], atsOff: [] })).toEqual({
      terms: ['design system'],
      atsOff: [],
    });
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
  it('keeps verdicts in the synced decided list and companies as Sources', () => {
    const a = p('1', 'Design Systems Designer', 'Acme');
    decide(a, 'skipped');
    expect(getDecided().map((d) => [d.fingerprint, d.verdict])).toEqual([
      [postingFingerprint(a), 'skipped'],
    ]);
    const undoMute = muteCompany('Figma');
    followCompany('Orbit');
    expect(getAllDecided()).toMatchObject({ muted: ['Figma'], followed: ['Orbit'] });
    expect(getSources().map((x) => [x.kind, x.ref, x.muted ?? false])).toEqual([
      ['company', 'figma', true],
      ['company', 'orbit', false],
    ]);
    undoMute();
    expect(getSources().map((x) => x.ref)).toEqual(['orbit']);
  });

  it('mutes every Source named for a company, and Undo leaves an earlier mute', () => {
    replaceSources([
      { kind: 'ashby', ref: 'ramp', label: 'Ramp' },
      { kind: 'company', ref: 'ramp', label: 'Ramp', muted: true },
    ]);
    const undo = muteCompany('ramp');
    expect(getSources().every((x) => x.muted)).toBe(true);
    undo();
    expect(getSources().map((x) => x.muted ?? false)).toEqual([false, true]);
    unmuteCompany('Ramp');
    expect(getAllDecided().muted).toEqual([]);
  });

  it('moves the old per-browser object into the synced stores, once', () => {
    localStorage.setItem(
      'rjb_decided',
      JSON.stringify({
        decided: [{ fingerprint: 'x', verdict: 'skipped', at: '2026-10-02' }],
        muted: ['Figma', 3],
        followed: ['Orbit', 'Figma'],
      }),
    );
    moveLegacyDecided();
    expect(getDecided()).toEqual([{ fingerprint: 'x', verdict: 'skipped', at: '2026-10-02' }]);
    expect(getAllDecided()).toMatchObject({ muted: ['Figma'], followed: ['Orbit'] });
    moveLegacyDecided();
    expect(getSources()).toHaveLength(2);
  });

  it('notes a first-seen day once', () => {
    noteSeen(['a'], Date.parse('2026-10-01T12:00:00'));
    noteSeen(['a', 'b'], NOW);
    expect(readSeen()).toEqual({ a: '2026-10-01', b: '2026-10-28' });
  });
});

describe('row words', () => {
  const base = {
    ...p('1', 'Design Systems Designer', 'Acme'),
    score: 0,
    hit: 'title' as const,
    snippet: '',
    titles: [],
    signals: [],
  };
  it('says why a posting is listed, with its signals', () => {
    expect(
      whyLine({ ...base, signals: [{ id: 'contract', label: 'Contract', evidence: '' }] }),
    ).toBe('Design-system title; contract');
    expect(whyLine({ ...base, title: 'Design Technologist' })).toBe('Related title');
  });
  it('states pay only as the source gives it', () => {
    expect(payLabel({ salaryMin: 95000, salaryMax: 120000 })).toBe('$95k to $120k');
    expect(payLabel({ salaryMax: 80000, currency: 'EUR' })).toBe('€80k');
    expect(payLabel({ salaryMin: 95000, salaryMax: 120000, currency: 'EUR' })).toBe(
      '€95k to €120k',
    );
    expect(payLabel({ salaryMin: 70000, salaryMax: 85000, currency: 'gbp' })).toBe('£70k to £85k');
    expect(payLabel({ salaryMax: 150000, currency: 'CAD' })).toBe('CAD 150k');
    expect(payLabel({})).toBe('');
  });
});

describe('last read (#448 slice 2): kept across a reload', () => {
  const listedRead = (postings: Posting[]) => {
    const r = read(postings);
    const view = buildFeed(r, phraseProfile, [], {
      now: NOW,
      decided: none,
      seen: {},
      saved: new Set(),
    });
    return { r, view };
  };

  it('keeps only the postings the Feed listed, text cut, and reads them back', () => {
    const ds = p('1', 'Design Systems Designer', 'Acme', { text: 'x'.repeat(5000) });
    const other = p('2', 'Accountant', 'Acme');
    const { r, view } = listedRead([ds, other]);
    saveLastRead(r, view, NOW);
    const back = loadLastRead();
    expect(back?.at).toBe(NOW);
    expect(back?.result.postings.map((x) => x.id)).toEqual(['1']);
    expect(back?.result.postings[0].text).toHaveLength(LAST_READ_TEXT_MAX);
    expect(back?.result.sources).toEqual(r.sources);
  });

  it('caps what it keeps, newest first', () => {
    const many = Array.from({ length: LAST_READ_MAX + 20 }, (_, i) =>
      p(String(i), 'Design Systems Designer', `Co${i}`, {
        postedAt: new Date(NOW - i * 60e3).toISOString(),
      }),
    );
    const { r, view } = listedRead(many);
    saveLastRead(r, view, NOW);
    const kept = loadLastRead()!.result.postings;
    expect(kept).toHaveLength(LAST_READ_MAX);
    expect(kept[0].id).toBe('0');
  });

  it('reads nothing from a missing or broken store', () => {
    expect(loadLastRead()).toBeNull();
    localStorage.setItem(LAST_READ_KEY, '{"at":"x","postings":[{"id":1}]}');
    expect(loadLastRead()).toBeNull();
    const bad = { id: 'a', title: 'T', company: 'C', text: '', location: '', url: 'javascript:x' };
    localStorage.setItem(LAST_READ_KEY, JSON.stringify({ at: NOW, postings: [bad], sources: [] }));
    expect(loadLastRead()?.result.postings).toEqual([]);
  });
});
