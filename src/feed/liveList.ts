// Live postings' list (LiveFeedPanel): what the rows are, given what the sources returned. Pure, so
// the breadth guard (feed/breadth.test.ts) counts today's pipeline through the very code the panel
// runs: term or sweep matching (or every posting on a scored track), then targeting.
import { rankAll, rankPostings } from './match';
import { applyTargeting, type HiddenCounts, type Targeting } from './targeting';
import { sweepRank, type SweptPosting } from './sweep';
import type { WorkMode } from '../jobsData';
import type { Posting } from './types';

export interface LiveListOptions {
  term: string;
  /** The wide sweep's titles, when the sweep is on. */
  sweep: string[] | null;
  /** A scored track (src/tracks): no term gate, the scorer decides. */
  scored: boolean;
  /** A Contracts track: SAM.gov read the place; the term only narrows. */
  contracts: boolean;
  where: string;
  mode: WorkMode;
  now: number;
}

/** The ranked rows before targeting (the panel's related-title counts read these). */
export function matchLive(postings: Posting[], o: LiveListOptions): SweptPosting[] {
  const r = { where: o.where, mode: o.mode, now: o.now };
  if (o.contracts) {
    const all = { where: '', mode: 'any' as const, now: o.now };
    const list = o.term.trim()
      ? rankPostings(postings, { ...all, term: o.term })
      : rankAll(postings, all);
    return list.map((p) => ({ ...p, titles: [] }));
  }
  // No term gate on a scored track: the term (or the sweep) picks what is read, the scorer what
  // is listed.
  if (o.scored) return rankAll(postings, r).map((p) => ({ ...p, titles: [] }));
  return o.sweep
    ? sweepRank(postings, o.sweep, r)
    : rankPostings(postings, { ...r, term: o.term }).map((p) => ({ ...p, titles: [] }));
}

export function liveList(
  postings: Posting[],
  o: LiveListOptions,
  targeting: Targeting,
): {
  matched: SweptPosting[];
  postings: SweptPosting[];
  review: SweptPosting[];
  hidden: HiddenCounts;
} {
  const matched = matchLive(postings, o);
  return { matched, ...applyTargeting(matched, targeting) };
}
