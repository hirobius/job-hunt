// The track scorer (Muse handoff, 2026-10-24): title + posting evidence → a score, a verdict
// (queue | review | reject) and the reasons, so every listed posting says why it is there. Ported
// as given; tune a track through its config (track-config.ts), not here. Pure and shared by the
// client (Live postings, Companies, dreams) and the sync edge function.
import type { TrackConfig } from './track-config.ts';
import { dedupeRoles } from './roleKey.ts';

export interface NormalizedPosting {
  source:
    | 'greenhouse'
    | 'lever'
    | 'ashby'
    // The other board kinds the app reads (Simplify 6/9: the sync reads them too).
    | 'workable'
    | 'recruitee'
    | 'smartrecruiters'
    | 'teamtailor'
    | 'personio'
    // The five read from their careers pages' public JSON (feed/sources/atsExtra.ts, #576).
    | 'bamboohr'
    | 'rippling'
    | 'gem'
    | 'pinpoint'
    | 'breezy'
    | 'jsearch'
    | 'adzuna'
    // The sync's own whole-web searches (tracks/feeds).
    | 'theirstack'
    | 'jooble'
    | 'ids'
    // The keyless remote boards the sync reads whole (tracks/feeds).
    | 'arbeitnow'
    | 'remoteok'
    | 'wwr'
    | 'remotive'
    | 'jobicy'
    | 'hn'
    | 'rss'
    | 'manual';
  sourceId: string;
  title: string;
  company: string;
  location?: string;
  remote?: boolean;
  url: string;
  descriptionText: string;
  postedAt?: string;
  /** The source's last-changed stamp for the job (Greenhouse `updated_at`), when it gives one.
   *  Stored with the row so the next sync can tell an unchanged job from a changed one and
   *  reuse this description instead of downloading it again (#448 delta reads). */
  sourceUpdatedAt?: string;
}

export type Verdict = 'queue' | 'review' | 'reject';

export interface ScoreResult {
  score: number;
  verdict: Verdict;
  reasons: string[];
  matchedSignals: string[];
}

// Compiled once per pattern (no g flag, so a shared RegExp keeps no state between tests).
const compiled = new Map<string, RegExp>();
const rx = (pattern: string) => {
  let re = compiled.get(pattern);
  if (!re) compiled.set(pattern, (re = new RegExp(pattern, 'i')));
  return re;
};

export function scorePosting(posting: NormalizedPosting, track: TrackConfig): ScoreResult {
  const title = posting.title ?? '';
  const reasons: string[] = [];
  const strongHit = track.titleStrong.find((p) => rx(p).test(title));
  const adjacentHit = track.titleAdjacent.find((p) => rx(p).test(title));
  const negativeHit = track.titleNegative.find((p) => rx(p).test(title));
  if (negativeHit && !strongHit)
    return {
      score: 0,
      verdict: 'reject',
      reasons: [`rejected: title matches negative /${negativeHit}/`],
      matchedSignals: [],
    };
  const matchedSignals: string[] = [];
  let signalWeight = 0;
  for (const s of track.descriptionSignals) {
    if (rx(s.pattern).test(posting.descriptionText ?? '')) {
      matchedSignals.push(s.label);
      signalWeight += s.weight;
    }
  }
  if (strongHit) {
    const score = Math.min(100, 88 + signalWeight);
    reasons.push(`title match: /${strongHit}/`);
    if (matchedSignals.length) reasons.push(`body confirms: ${matchedSignals.join(', ')}`);
    return { score, verdict: 'queue', reasons, matchedSignals };
  }
  if (adjacentHit) {
    reasons.push(`adjacent title: /${adjacentHit}/`);
    if (matchedSignals.length >= track.adjacentSignalsToQueue) {
      reasons.push(
        `promoted: ${matchedSignals.length} body signals (${matchedSignals.join(', ')})`,
      );
      return {
        score: Math.min(84, 62 + signalWeight * 3),
        verdict: 'queue',
        reasons,
        matchedSignals,
      };
    }
    if (matchedSignals.length >= track.adjacentSignalsToReview) {
      reasons.push(`held for review: only ${matchedSignals.length} body signal(s)`);
      return { score: 50 + signalWeight * 2, verdict: 'review', reasons, matchedSignals };
    }
    reasons.push('rejected: adjacent title with no body evidence');
    return { score: 20, verdict: 'reject', reasons, matchedSignals };
  }
  if (matchedSignals.length >= 3) {
    reasons.push(`held for review: no title signal, ${matchedSignals.length} body signals`);
    return { score: 45, verdict: 'review', reasons, matchedSignals };
  }
  return { score: 5, verdict: 'reject', reasons: ['no title or body signal'], matchedSignals };
}

export function fitRejectReason(p: NormalizedPosting): string | null {
  if (/\b(intern|internship|apprentice)\b/i.test(p.title)) return 'fit: internship';
  if (/\bstudent\b|\b20(27|28) (summer|grad)/i.test(p.title)) return 'fit: student/cohort role';
  return null;
}

export function fingerprint(p: Pick<NormalizedPosting, 'company' | 'title'>): string {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/\b(senior|staff|lead|principal|sr\.?|jr\.?|i{1,3}|[12])\b/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  return `${norm(p.company)}::${norm(p.title)}`;
}

/** One posting per role across sources (#576 item 9, roleKey.ts): the company board's copy over
 *  a feed's. Senior and Staff stay apart; the Skip fingerprint above is unchanged. */
export function dedupe(postings: NormalizedPosting[]): NormalizedPosting[] {
  return dedupeRoles(postings, (p) => p.source);
}
