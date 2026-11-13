// The Feed (simplify 5/9, #386, CONTEXT.md): the one module that turns Sources and the Search
// profile into ranked Postings for Review new. Reading goes through a `PostingReader` (reader.ts:
// the browser adapter today, the server `postings` table in #387); everything after the read is
// here, pure and table-tested:
//
//   read (the wide sweep over every profile title, every board)
//        → every posting that passes the place and work mode (no term gate)
//        → the design-system inclusion check (phrase rules on the title, related titles) and the
//          profile's filters (leave out, level, pay)
//        → one list, newest first, minus what was decided (Skip / Save, by posting), muted
//          companies and saved jobs
//
// No fit tiers (Adrian 2026-10-28): nothing is scored, held back or ranked out of sight; every
// design-system posting that passes is listed. Breadth is the point: the Feed reads every term and
// board any Live postings search would, plus dream and target boards, and the breadth guard
// (breadth.test.ts) fails if it ever lists fewer than today's pipeline from the same inputs.
import { dedupKey } from '../store';
import { NO_TARGETING, type HiddenCounts, type Targeting } from './targeting';
import { rankAll } from './match';
import { applyTargeting } from './targeting';
import { normalizeForPhrase, phraseRegex, saysDesignSystem } from './mustInclude';
import type { SweptPosting } from './sweep';
import type { FeedResult, SourceStatus } from './fetchFeed';
import { companyKey, dayOf, postingFingerprint, type DecidedState } from './decided';
import { boardUrlsOf, type SearchProfile, type Source } from './profile';
import type { FeedRequest } from './reader';
import { parseBoardUrl } from './sources/ats';
import { loadPersisted, savePersisted } from '../persisted';
import type { Posting } from './types';

export interface FeedRow extends SweptPosting {
  fingerprint: string;
  /** The day this browser first read it (YYYY-MM-DD); today for one never seen before. */
  firstSeen: string;
  isNew: boolean;
  /** Why it matched, short: the row's one line under the title (Adrian 2026-10-28). */
  why: string;
  /** The match score (title hit, signals, freshness): the Best match sort. */
  rank: number;
}

export interface FeedView {
  /** Browse: every undecided design-system posting, newest first. */
  rows: FeedRow[];
  hidden: HiddenCounts & { decided: number; muted: number; saved: number };
  /** Distinct sources that answered (each board once, each feed once whatever the terms). */
  sourcesRead: number;
  failed: SourceStatus[];
  /** Undecided postings first seen today. */
  newToday: number;
  /** Every distinct posting the Feed lists before decisions: what the breadth guard counts. */
  listed: string[];
  /** Postings read that passed the place and work mode, before the inclusion check and filters. */
  considered: number;
}

/** What to read for this profile and these sources. */
export function feedRequest(profile: SearchProfile, sources: Source[]): FeedRequest {
  // Boards sorted, so a board moving between lists (a dream's board becoming a watched tile on
  // Save) is the same request and nothing is read again.
  return {
    terms: profile.titles,
    boardUrls: [...new Set(boardUrlsOf(sources))].sort(),
    include: profile.include,
  };
}

/** Targeting from the profile: the same rules Live postings' Calibrate applies. */
export function targetingOf(profile: SearchProfile): Targeting {
  return {
    ...NO_TARGETING,
    exclude: profile.exclude,
    seniority: profile.level,
    salaryFloor: profile.payFloor,
    include: profile.include,
    phrases: true,
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
  // Every posting read that passes the place and work mode: the titles chose what to read, the
  // inclusion check (not a search term) decides what is listed.
  const matched = rankAll(read.postings, { where: profile.where, mode: profile.mode, now: o.now });
  const list = applyTargeting(
    matched.map((p) => ({ ...p, titles: titlesIn(p.title, profile.titles) })),
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
  const listed: string[] = [];
  const keep = (p: SweptPosting): FeedRow | null => {
    const fingerprint = postingFingerprint(p);
    // The same posting twice (two sources, or once in each list): kept once.
    if (seenFp.has(fingerprint)) return null;
    seenFp.add(fingerprint);
    listed.push(fingerprint);
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
      why: whyLine(p),
      rank: p.score,
    };
  };
  const rows = sortRows(
    list.postings.map(keep).filter((r): r is FeedRow => !!r),
    'newest',
  );
  const { read: sourcesRead, failed } = countSources(read.sources);
  return {
    rows,
    hidden,
    sourcesRead,
    failed,
    newToday: rows.filter((r) => r.isNew).length,
    listed,
    considered: matched.length,
  };
}

/** Every fingerprint a read would show, for noting first-seen days before building the view. */
export const fingerprintsOf = (read: FeedResult): string[] => read.postings.map(postingFingerprint);

// ---- Browse: sort and filter ----

export type FeedSort = 'score' | 'newest' | 'company';
export type FeedFilter = 'new' | 'contract' | 'founding' | 'remote';

export const FILTER_LABEL: Record<FeedFilter, string> = {
  new: 'New',
  contract: 'Contract',
  founding: 'First hire',
  remote: 'Remote',
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

// ---- the row's words ----

/** The profile titles a posting's title names (whole phrases), in profile order. */
export function titlesIn(title: string, titles: string[]): string[] {
  const t = normalizeForPhrase(title);
  return titles.filter((x) => {
    const re = phraseRegex(x);
    return !!re && re.test(t);
  });
}

/** Why a posting is listed, in a few words: its title says design system(s), or it is a related
 *  title (Design Technologist); then contract / first hire. */
export function whyLine(p: SweptPosting): string {
  return [
    saysDesignSystem(p.title) ? 'Design-system title' : 'Related title',
    ...p.signals.map((sig) => sig.label.toLowerCase()),
  ].join('; ');
}

/** The sign a pay line uses for a currency; any other currency is its code ("CAD 120k"). */
const PAY_SIGN: Record<string, string> = { USD: '$', EUR: '€', GBP: '£' };

/** "$95k to $120k" (or "€95k to €120k") from a source's stated yearly pay; '' when it states
 *  none, so the card shows no pay line (#547). */
export function payLabel(p: Pick<SweptPosting, 'salaryMin' | 'salaryMax' | 'currency'>): string {
  const code = (p.currency || 'USD').toUpperCase();
  const sym = PAY_SIGN[code] ?? `${code} `;
  const k = (n: number) => `${sym}${Math.round(n / 1000)}k`;
  if (p.salaryMin && p.salaryMax && p.salaryMin !== p.salaryMax)
    return `${k(p.salaryMin)} to ${k(p.salaryMax)}`;
  const one = p.salaryMax ?? p.salaryMin;
  return one ? k(one) : '';
}

// The last read, kept across a reload (#448 slice 2): Today shows it at once and refreshes behind
// it. Only the postings the Feed listed (the rest would never show), newest first, capped and cut
// the way the auto-scan's `rjb_autoscan_postings` are. A cache: local, never synced.
export const LAST_READ_KEY = 'rjb_feed_last';
export const LAST_READ_MAX = 300;
export const LAST_READ_TEXT_MAX = 1500;

const postedMs = (p: Posting) => Date.parse(p.postedAt ?? '') || 0;

export function saveLastRead(read: FeedResult, view: FeedView, at: number): void {
  const listed = new Set(view.listed);
  const postings = read.postings
    .filter((p) => listed.has(postingFingerprint(p)))
    .sort((a, b) => postedMs(b) - postedMs(a))
    .slice(0, LAST_READ_MAX)
    .map((p) => ({ ...p, text: p.text.slice(0, LAST_READ_TEXT_MAX) }));
  savePersisted(LAST_READ_KEY, { at, postings, sources: read.sources });
}

const isStr = (v: unknown): v is string => typeof v === 'string';

export function loadLastRead(): { at: number; result: FeedResult } | null {
  const raw = loadPersisted<unknown>(LAST_READ_KEY, null);
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as { at?: unknown; postings?: unknown; sources?: unknown };
  if (typeof o.at !== 'number' || !Array.isArray(o.postings)) return null;
  const postings = (o.postings as Partial<Posting>[]).filter(
    (p): p is Posting =>
      !!p &&
      typeof p === 'object' &&
      isStr(p.id) &&
      isStr(p.title) &&
      isStr(p.company) &&
      isStr(p.text) &&
      isStr(p.location) &&
      /^https?:\/\//i.test(String(p.url)),
  );
  const sources = (Array.isArray(o.sources) ? (o.sources as Partial<SourceStatus>[]) : []).filter(
    (s): s is SourceStatus => !!s && typeof s === 'object' && isStr(s.key) && isStr(s.label),
  );
  return { at: o.at, result: { postings: postings.slice(0, LAST_READ_MAX), sources } };
}
