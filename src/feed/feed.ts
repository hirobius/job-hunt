// The Feed (simplify 5/9, #386, CONTEXT.md): the one module that turns Sources and the Search
// profile into ranked Postings for Review new. Reading goes through a `PostingReader` (reader.ts:
// the browser adapter today, the server `postings` table in #387); everything after the read is
// here, pure and table-tested:
//
//   read → match (the wide sweep over every profile title, or every posting on a scored profile)
//        → targeting (must include / the scorer, leave out, level, pay, title filter)
//        → Browse rows + the scorer's Review bucket (its own section, never dropped)
//        → minus what was decided (Skip / Save, by posting), muted companies and saved jobs
//
// Breadth (Adrian's hard condition): the Feed reads every term and board any Live postings search
// would, plus dream and target boards, and the breadth guard (breadth.test.ts) fails if it ever
// returns fewer distinct postings than today's pipeline from the same inputs.
import { dedupKey } from '../store';
import { scorerFor } from '../tracks/forTrack';
import { reasonsLine } from '../tracks/scoreForTrack';
import { NO_TARGETING, type HiddenCounts, type Targeting } from './targeting';
import { liveList } from './liveList';
import type { SweptPosting } from './sweep';
import type { FeedResult, SourceStatus } from './fetchFeed';
import { companyKey, dayOf, postingFingerprint, type DecidedState } from './decided';
import { boardUrlsOf, type SearchProfile, type Source } from './profile';
import type { FeedRequest } from './reader';
import { parseBoardUrl } from './sources/ats';

export interface FeedRow extends SweptPosting {
  fingerprint: string;
  /** The day this browser first read it (YYYY-MM-DD); today for one never seen before. */
  firstSeen: string;
  isNew: boolean;
  /** The scorer's "Queued because: …" line, on a scored profile. */
  reasons?: string;
  /** The ranking score shown and sorted by: the scorer's on a scored profile. */
  rank: number;
}

export interface FeedView {
  /** Browse: every undecided posting, best first. */
  rows: FeedRow[];
  /** The scorer's Review bucket (scored profiles only), undecided, its own section. */
  review: FeedRow[];
  hidden: HiddenCounts & { decided: number; muted: number; saved: number };
  /** Distinct sources that answered (each board once, each feed once whatever the terms). */
  sourcesRead: number;
  failed: SourceStatus[];
  /** Undecided postings first seen today (Browse + Review). */
  newToday: number;
  /** Every distinct posting the Feed kept before decisions: what the breadth guard counts. */
  distinct: number;
}

/** What to read for this profile and these sources. */
export function feedRequest(profile: SearchProfile, sources: Source[]): FeedRequest {
  // Boards sorted, so a board moving between lists (a dream's board becoming a watched tile on
  // Save) is the same request and nothing is read again.
  return { terms: profile.titles, boardUrls: [...new Set(boardUrlsOf(sources))].sort() };
}

/** Targeting from the profile: the same rules Live postings' Calibrate applies. */
export function targetingOf(profile: SearchProfile): Targeting {
  return {
    ...NO_TARGETING,
    exclude: profile.exclude,
    seniority: profile.level,
    salaryFloor: profile.payFloor,
    titles: { on: profile.titles, off: profile.offTitles },
    include: profile.include,
  };
}

/** A source key without its sweep term ('hn|design systems' → 'hn'). */
const sourceOf = (s: SourceStatus) => s.key.split('|')[0];

export function countSources(statuses: SourceStatus[]): { read: number; failed: SourceStatus[] } {
  const ok = new Set<string>();
  const bad = new Map<string, SourceStatus>();
  for (const s of statuses) {
    const k = sourceOf(s);
    if (s.error) {
      if (!bad.has(k)) bad.set(k, s);
    } else ok.add(k);
  }
  // A feed that answered for one term and failed for another still answered.
  return { read: ok.size, failed: [...bad].filter(([k]) => !ok.has(k)).map(([, s]) => s) };
}

/** Board key of a board posting (`greenhouse:acme:123` → `greenhouse:acme`). */
export const boardKeyOf = (id: string): string | null => {
  const [kind, slug] = id.split(':');
  return kind && slug && id.split(':').length >= 3 ? `${kind}:${slug.toLowerCase()}` : null;
};

export function buildFeed(
  read: FeedResult,
  profile: SearchProfile,
  sources: Source[],
  o: {
    now: number;
    decided: DecidedState;
    /** First-seen days by fingerprint (decided.ts `noteSeen`). */
    seen: Record<string, string>;
    /** dedupKey of every saved job's link. */
    saved: ReadonlySet<string>;
  },
): FeedView {
  const scored = !!scorerFor(profile.include);
  const list = liveList(
    read.postings,
    {
      term: profile.titles[0] ?? '',
      sweep: profile.titles,
      scored,
      contracts: false,
      where: profile.where,
      mode: profile.mode,
      now: o.now,
    },
    targetingOf(profile),
  );
  const today = dayOf(o.now);
  const decided = new Set(o.decided.decided.map((d) => d.fingerprint));
  const muted = new Set(o.decided.muted.map(companyKey));
  // A muted Source hides its company's postings, and a muted board everything read from it.
  const mutedBoards = new Set<string>();
  for (const s of sources) {
    if (!s.muted) continue;
    muted.add(companyKey(s.label));
    const b = s.kind === 'board' ? parseBoardUrl(s.ref) : null;
    if (b) mutedBoards.add(`${b.kind}:${b.slug.toLowerCase()}`);
  }
  const hidden = { ...list.hidden, decided: 0, muted: 0, saved: 0 };
  const seenFp = new Set<string>();
  let distinct = 0;
  const keep = (p: SweptPosting): FeedRow | null => {
    const fingerprint = postingFingerprint(p);
    // The same posting twice (two sources, or once in each list): kept once.
    if (seenFp.has(fingerprint)) return null;
    seenFp.add(fingerprint);
    distinct++;
    if (o.saved.has(dedupKey(p.url))) {
      hidden.saved++;
      return null;
    }
    if (decided.has(fingerprint)) {
      hidden.decided++;
      return null;
    }
    const board = boardKeyOf(p.id);
    if (
      (p.company.trim() && muted.has(companyKey(p.company))) ||
      (board && mutedBoards.has(board))
    ) {
      hidden.muted++;
      return null;
    }
    const firstSeen = o.seen[fingerprint] ?? today;
    return {
      ...p,
      fingerprint,
      firstSeen,
      isNew: firstSeen === today,
      reasons: p.trackScore ? reasonsLine(p.trackScore) : undefined,
      rank: p.trackScore ? p.trackScore.score : p.score,
    };
  };
  const rows = list.postings.map(keep).filter((r): r is FeedRow => !!r);
  const review = list.review.map(keep).filter((r): r is FeedRow => !!r);
  const { read: sourcesRead, failed } = countSources(read.sources);
  return {
    rows,
    review,
    hidden,
    sourcesRead,
    failed,
    newToday: [...rows, ...review].filter((r) => r.isNew).length,
    distinct,
  };
}

/** Every fingerprint a read would show, for noting first-seen days before building the view. */
export const fingerprintsOf = (read: FeedResult): string[] => read.postings.map(postingFingerprint);

// ---- Browse: sort and filter ----

export type FeedSort = 'score' | 'newest' | 'company';
export type FeedFilter = 'new' | 'contract' | 'founding' | 'remote';

export const FILTER_LABEL: Record<FeedFilter, string> = {
  new: 'New today',
  contract: 'Contract',
  founding: 'First hire',
  remote: 'Remote',
};

export const SORT_LABEL: Record<FeedSort, string> = {
  score: 'Best match',
  newest: 'Newest',
  company: 'Company',
};

const passes = (r: FeedRow, f: FeedFilter) =>
  f === 'new' ? r.isNew : f === 'remote' ? r.mode === 'remote' : r.signals.some((s) => s.id === f);

/** Rows that pass every filter that is on (none on: all). */
export const filterRows = (rows: FeedRow[], on: readonly FeedFilter[]): FeedRow[] =>
  on.length ? rows.filter((r) => on.every((f) => passes(r, f))) : rows;

const newestFirst = (a: FeedRow, b: FeedRow) =>
  (b.postedAt ?? b.firstSeen).localeCompare(a.postedAt ?? a.firstSeen) ||
  b.firstSeen.localeCompare(a.firstSeen);

/** Sorted copies, stable: ties fall back to best match. */
export function sortRows(rows: FeedRow[], by: FeedSort): FeedRow[] {
  const byRank = (a: FeedRow, b: FeedRow) => b.rank - a.rank || newestFirst(a, b);
  const cmp =
    by === 'newest'
      ? (a: FeedRow, b: FeedRow) => newestFirst(a, b) || b.rank - a.rank
      : by === 'company'
        ? (a: FeedRow, b: FeedRow) =>
            (a.company || '￿').localeCompare(b.company || '￿', undefined, {
              sensitivity: 'base',
            }) || byRank(a, b)
        : byRank;
  return [...rows].sort(cmp);
}

/** How many rows each filter would leave (for the chips' counts). */
export function filterCounts(rows: FeedRow[]): Record<FeedFilter, number> {
  const out = { new: 0, contract: 0, founding: 0, remote: 0 };
  for (const r of rows)
    for (const f of Object.keys(out) as FeedFilter[]) if (passes(r, f)) out[f]++;
  return out;
}

/** "12 new today from 9 sources". */
export function newTodayLine(newToday: number, sources: number): string {
  const from = `from ${sources} ${sources === 1 ? 'source' : 'sources'}`;
  return newToday > 0 ? `${newToday} new today ${from}` : `Nothing new today ${from}`;
}
