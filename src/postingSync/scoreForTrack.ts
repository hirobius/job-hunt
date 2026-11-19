// One verdict for a posting on a scored track: the scorer (score.ts), then the fit rule (no
// internships or student cohorts reach the queue, Muse Phase 2.5). Pure; the client and the sync
// edge function both call this, so a posting reads the same in the app and in the database.
import {
  fitRejectReason,
  scorePosting,
  type NormalizedPosting,
  type ScoreResult,
} from './score.ts';
import type { TrackConfig } from './track-config.ts';

export function scoreForTrack(p: NormalizedPosting, track: TrackConfig): ScoreResult {
  const r = scorePosting(p, track);
  if (r.verdict === 'reject') return r;
  const fit = fitRejectReason(p);
  return fit
    ? { ...r, score: 0, verdict: 'reject', reasons: [...r.reasons, `rejected: ${fit}`] }
    : r;
}

/** The line a card shows: "Queued because: title match: /design systems?/; body confirms: …". */
export function reasonsLine(r: Pick<ScoreResult, 'verdict' | 'reasons'>): string {
  const lead =
    r.verdict === 'queue' ? 'Queued' : r.verdict === 'review' ? 'Held for review' : 'Left out';
  return `${lead} because: ${r.reasons.join('; ')}`;
}

/** Best score first, then newest. */
export function byScoreThenNewest<T extends { score: number; postedAt?: string }>(
  a: T,
  b: T,
): number {
  return b.score - a.score || (b.postedAt ?? '').localeCompare(a.postedAt ?? '');
}
