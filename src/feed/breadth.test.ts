// The breadth guard (simplify 5/9, #386; CONTEXT.md "Breadth guard"): from the same recorded inputs,
// the new Feed must return every distinct posting today's Live postings returns, and so at least
// as many. Today's pipeline is counted through the code the panel runs (fetchFeed → liveList), at
// its widest: the track's default search and the wide sweep, together.
import { beforeEach, describe, expect, it } from 'vitest';
import { fetchFeed, memoryKv } from './fetchFeed';
import { liveList } from './liveList';
import { NO_TARGETING } from './targeting';
import { activeAtsRoles, type MustInclude } from './mustInclude';
import { activeTitles, type SweepTitles } from './sweepTitles';
import { postingFingerprint } from './decided';
import { browserReader } from './reader';
import { buildFeed, feedRequest } from './feed';
import { profileFrom, sourcesFrom } from './profile';
import { FIXTURE_NOW, TILE_URLS, fixtureFetch } from './breadth.fixture';
import type { Dream } from './dreams';
import type { Target } from './targets';
import type { Seniority } from '../curation/types';

beforeEach(() => localStorage.clear());

interface Track {
  titles: string[];
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
const mode = 'any' as const;
const fingerprints = (list: { company: string; title: string; url: string }[]) =>
  new Set(list.map(postingFingerprint));

/** Today's Live postings (LiveFeedPanel + DiscoverView), at its widest. */
async function livePostings(t: Track): Promise<Set<string>> {
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
  const out = new Set<string>();
  // The default search (the track's first search term) and the wide sweep over the ticked titles.
  for (const sweep of [null, ticked]) {
    const read = await fetchFeed(
      sweep
        ? { terms: sweep, boardUrls: TILE_URLS }
        : { term: searchTerms[0], boardUrls: TILE_URLS },
      fixtureFetch(),
      { kv: memoryKv(), now: () => FIXTURE_NOW, sources: { jobicy: true, remoteok: false } },
    );
    const list = liveList(
      read.postings,
      { term: searchTerms[0], sweep, scored, contracts: false, where, mode, now: FIXTURE_NOW },
      targeting,
    );
    for (const fp of fingerprints([...list.postings, ...list.review])) out.add(fp);
  }
  return out;
}

async function feed(t: Track) {
  const profile = profileFrom({
    atsRoles: t.atsRoles,
    seniority: t.seniority,
    sweep: t.sweep,
    include: t.include,
    where,
    mode,
  });
  const sources = sourcesFrom({ tileUrls: TILE_URLS, dreams, targets, muted: [], followed: [] });
  const read = await browserReader(fixtureFetch(), {
    kv: memoryKv(),
    now: () => FIXTURE_NOW,
    sources: { jobicy: true, remoteok: false },
  }).read(feedRequest(profile, sources));
  const view = buildFeed(read, profile, sources, {
    now: FIXTURE_NOW,
    decided: { decided: [], muted: [], followed: [] },
    seen: {},
    saved: new Set(),
  });
  return { view, fps: fingerprints([...view.rows, ...view.review]) };
}

const TRACKS: [string, Track][] = [
  [
    'a design systems (scored) track',
    {
      titles: ['Design Systems Designer', 'Design Systems Engineer'],
      atsRoles: ['Design Systems'],
      seniority: 'any',
      include: { terms: ['design systems'], atsOff: [] },
      sweep: { titles: ['Design Systems Designer', 'Design Systems Engineer'], off: [] },
    },
  ],
  [
    'a phrase-rule track',
    {
      titles: ['Product Designer', 'UX Designer'],
      atsRoles: [],
      seniority: 'any',
      include: { terms: [], atsOff: [] },
      sweep: { titles: ['Product Designer', 'UX Designer'], off: [] },
    },
  ],
];

describe('breadth guard', () => {
  it.each(TRACKS)('the Feed keeps every posting Live postings finds on %s', async (_, track) => {
    const before = await livePostings(track);
    const { view, fps: after } = await feed(track);
    console.info(`breadth (${_}): Live postings ${before.size} → Feed ${after.size}`);
    expect(after.size).toBeGreaterThanOrEqual(before.size);
    for (const fp of before) expect(after, `Feed lost ${fp}`).toContain(fp);
    // Nothing is decided yet: every distinct posting the Feed kept is on screen.
    expect(view.distinct).toBe(after.size);
  });

  it('reads dream and target boards and related titles, which Live postings never did', async () => {
    const track = TRACKS[0][1];
    const before = await livePostings(track);
    const { fps: after } = await feed(track);
    const added = [...after].filter((fp) => !before.has(fp));
    expect(added).toEqual(
      expect.arrayContaining([
        'delta::design systems designer', // a dream company's board
        'epsilon::design platform engineer', // an outreach target's board
        'glyph::design technologist', // found by searching the related title
      ]),
    );
  });

  it('keeps the scorer’s Review bucket as its own section', async () => {
    const { view } = await feed(TRACKS[0][1]);
    expect(view.review.length).toBeGreaterThan(0);
    for (const r of view.review) expect(r.trackScore?.verdict).toBe('review');
    expect(view.rows.every((r) => r.trackScore?.verdict === 'queue')).toBe(true);
  });
});
