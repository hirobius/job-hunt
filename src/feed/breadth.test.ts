// The breadth guard (simplify 5/9, #386; CONTEXT.md "Breadth guard"). Adrian's hard condition:
// catch as many distinct design-system openings as possible. From the same recorded source answers
// (breadth.fixture.ts), the Feed must list every design-system posting today's Live postings lists,
// and so at least as many, and it fails otherwise. Today's pipeline is counted through the code the
// panel runs (fetchFeed → liveList) at its widest: the track's default search and the wide sweep,
// together. A design-system posting is one that passes the plain inclusion check (the design-system
// phrase rules on the title, and related titles): the Feed's rule, with no fit tiers.
import { beforeEach, describe, expect, it } from 'vitest';
import { fetchFeed, memoryKv, type FeedResult } from './fetchFeed';
import { liveList } from './liveList';
import { NO_TARGETING } from './targeting';
import { passesInclude } from './include';
import { activeAtsRoles, type MustInclude } from './mustInclude';
import { activeTitles, type SweepTitles } from './sweepTitles';
import { postingFingerprint } from './decided';
import { browserReader } from './reader';
import { buildFeed, feedRequest, type FeedView } from './feed';
import { designSystemRule, PROFILE_MODE, profileFrom, sourcesFrom } from './profile';
import { BOARDS, FIXTURE_NOW, TILE_URLS, fixtureFetch } from './breadth.fixture';
import type { Dream } from './dreams';
import type { Target } from './targets';
import type { Seniority } from '../curation/types';
import type { Posting } from './types';

beforeEach(() => localStorage.clear());

interface Track {
  atsRoles: string[];
  seniority: Seniority;
  include: MustInclude;
  sweep: SweepTitles;
}

const dreams: Dream[] = [
  {
    key: 'delta',
    company: 'Delta',
    board: { kind: 'ashby', slug: 'delta' },
    seen: [],
    starredAt: '2026-10-01T00:00:00Z',
  },
];
const targets: Target[] = [
  {
    login: 'epsilon',
    company: 'Epsilon',
    board: { kind: 'greenhouse', slug: 'epsilon' },
    savedAt: '2026-10-01T00:00:00Z',
  },
];

const where = '';
// The profile's mode (remote-only for now): Live postings is counted with the same setting.
const mode = PROFILE_MODE;
const SOURCES = { jobicy: true, remoteok: false };
const fps = (list: Pick<Posting, 'company' | 'title' | 'url'>[]) =>
  new Set(list.map(postingFingerprint));

/** Today's Live postings (LiveFeedPanel + DiscoverView), at its widest: what it lists. */
async function livePostings(t: Track): Promise<Posting[]> {
  const atsOn = activeAtsRoles(t.atsRoles, t.include);
  const ticked = activeTitles(t.sweep);
  const searchTerms = atsOn.length ? atsOn : ticked;
  const scored = t.include.terms.some((x) => /design systems?/i.test(x));
  const targeting = {
    ...NO_TARGETING,
    seniority: t.seniority,
    titles: { on: ticked, off: t.sweep.off },
    include: t.include,
  };
  const out: Posting[] = [];
  for (const sweep of [null, ticked]) {
    const read = await fetchFeed(
      sweep
        ? { terms: sweep, boardUrls: TILE_URLS }
        : { term: searchTerms[0], boardUrls: TILE_URLS },
      fixtureFetch(),
      { kv: memoryKv(), now: () => FIXTURE_NOW, sources: SOURCES },
    );
    const list = liveList(
      read.postings,
      { term: searchTerms[0], sweep, scored, where, mode, now: FIXTURE_NOW },
      targeting,
    );
    out.push(...list.postings, ...list.review);
  }
  return out;
}

async function feed(t: Track): Promise<{ view: FeedView; read: FeedResult; listed: Set<string> }> {
  const profile = profileFrom({ ...t, where });
  const sources = sourcesFrom({ tileUrls: TILE_URLS, dreams, targets, muted: [], followed: [] });
  const read = await browserReader(fixtureFetch(), {
    kv: memoryKv(),
    now: () => FIXTURE_NOW,
    sources: SOURCES,
  }).read(feedRequest(profile, sources));
  const view = buildFeed(read, profile, sources, {
    now: FIXTURE_NOW,
    decided: { decided: [], muted: [], followed: [] },
    seen: {},
    saved: new Set(),
  });
  return { view, read, listed: fps(view.rows) };
}

const TRACKS: [string, Track][] = [
  [
    'a design systems track',
    {
      atsRoles: ['Design Systems'],
      seniority: 'any',
      include: { terms: ['design systems'], atsOff: [] },
      sweep: { titles: ['Design Systems Designer', 'Design Systems Engineer'], off: [] },
    },
  ],
  [
    'a track with no design system rule',
    {
      atsRoles: [],
      seniority: 'any',
      include: { terms: [], atsOff: [] },
      sweep: { titles: ['Product Designer', 'UX Designer'], off: [] },
    },
  ],
  [
    'a track with a title switched off',
    {
      atsRoles: ['Design Systems'],
      seniority: 'any',
      include: { terms: ['design system'], atsOff: [] },
      sweep: {
        titles: ['Design Systems Designer', 'Design Systems Engineer'],
        off: ['Design Systems Engineer'],
      },
    },
  ],
];

describe('breadth guard', () => {
  it.each(TRACKS)(
    'the Feed lists every design-system posting Live postings lists, on %s',
    async (name, track) => {
      const rule = designSystemRule(track.include);
      const before = fps(
        (await livePostings(track)).filter((p) => passesInclude(rule, p.title, p.text)),
      );
      const { listed } = await feed(track);
      console.info(`breadth (${name}): Live postings ${before.size} → Feed ${listed.size}`);
      for (const fp of before) expect(listed, `the Feed lost ${fp}`).toContain(fp);
      expect(listed.size).toBeGreaterThanOrEqual(before.size);
    },
  );

  it('lists every design-system posting in the recorded answers, whatever the titles say', async () => {
    // Every design-system posting the fixture holds, from any source: the most the Feed can list.
    const all = await browserReader(fixtureFetch(), {
      kv: memoryKv(),
      now: () => FIXTURE_NOW,
      sources: SOURCES,
    }).read({
      terms: ['design system', 'design systems', 'design technologist'],
      boardUrls: Object.keys(BOARDS).map((k) => {
        const [kind, slug] = k.split(':');
        return kind === 'greenhouse'
          ? `https://boards.greenhouse.io/${slug}`
          : kind === 'lever'
            ? `https://jobs.lever.co/${slug}`
            : `https://jobs.ashbyhq.com/${slug}`;
      }),
    });
    const rule = designSystemRule({ terms: [], atsOff: [] });
    // Remote-only: a posting its source marks on-site or hybrid is out of reach on purpose.
    const every = fps(
      all.postings.filter(
        (p) => passesInclude(rule, p.title, p.text) && (!p.mode || p.mode === 'remote'),
      ),
    );
    const { listed } = await feed(TRACKS[0][1]);
    console.info(`breadth (ceiling): fixture holds ${every.size}, Feed lists ${listed.size}`);
    expect([...every].filter((fp) => !listed.has(fp))).toEqual([]);
  });

  it('reads every source kind: HN hiring and freelancer, Remotive, Jobicy, each board', async () => {
    const { read } = await feed(TRACKS[0][1]);
    const keys = new Set(read.sources.map((s) => s.key.split('|')[0]));
    for (const k of ['hn', 'remotive', 'jobicy', ...Object.keys(BOARDS)])
      expect(keys, k).toContain(k);
    expect(read.postings.some((p) => /Job type: Freelance/.test(p.text))).toBe(true);
  });

  it('reads dream and target boards and related titles, which Live postings never did', async () => {
    const before = fps(await livePostings(TRACKS[0][1]));
    const { listed } = await feed(TRACKS[0][1]);
    expect([...listed].filter((fp) => !before.has(fp))).toEqual(
      expect.arrayContaining([
        'delta::design systems designer', // a dream company's board
        'glyph::design technologist', // found by searching the related title
      ]),
    );
  });

  it('holds nothing back: no fit tiers, every posting not listed is counted', async () => {
    const { view } = await feed(TRACKS[0][1]);
    const h = view.hidden;
    const notListed = h.include + h.exclude + h.seniority + h.salary + h.titles;
    // Every posting considered is listed or counted under a filter (a posting read twice is listed
    // once), and with nothing decided every listed posting is on screen.
    expect(view.considered - notListed).toBeGreaterThanOrEqual(view.rows.length);
    expect(view.listed).toHaveLength(view.rows.length);
    expect(view.rows.every((r) => !r.trackScore)).toBe(true);
  });

  it('remote only: drops on-site and hybrid postings, keeps one that names no place', async () => {
    const { view } = await feed(TRACKS[0][1]);
    const acme = view.rows.filter((r) => r.id.startsWith('greenhouse:acme:'));
    expect(acme.map((r) => r.title).sort()).toEqual([
      'Senior Design System Engineer',
      'Staff Design Systems Engineer',
    ]);
    expect(acme.find((r) => r.title.startsWith('Senior'))?.location).toBe('');
  });

  it('lists newest first', async () => {
    const { view } = await feed(TRACKS[0][1]);
    const dates = view.rows.map((r) => r.postedAt ?? '');
    expect(dates).toEqual([...dates].sort().reverse());
  });
});
