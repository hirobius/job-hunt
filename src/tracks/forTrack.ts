// The scorer on the client (Muse Phase 1, 2026-10-24): which tracks are scored, and the adapter
// from a live Posting (src/feed) to the scorer's NormalizedPosting. A track is scored when its
// must-include rule asks for "design system(s)" (the Design Systems pack and the systems-only
// move set that): its config then replaces must include, related titles and the title filter in
// Live postings, Companies' matching roles and dream companies. Every other track keeps the
// phrase rules (feed/mustInclude.ts).
import { hasRelatedTitles, keepIncluded, type IncludeRule } from '../feed/mustInclude';
import type { FeedSourceId, Posting } from '../feed/types';
import type { NormalizedPosting, ScoreResult } from './score.ts';
import { byScoreThenNewest, scoreForTrack } from './scoreForTrack.ts';
import { designSystemsTrack, type TrackConfig } from './track-config.ts';

/** What a scored track says it does (onboarding's pack copy, Calibrate). */
export const SCORED_TRACK_COPY =
  'Design-systems roles — scored on title + posting evidence, with reasons.';

/** The track's scorer config, or null for a track the phrase rules filter. */
export const scorerFor = (rule: IncludeRule | undefined): TrackConfig | null =>
  rule && hasRelatedTitles(rule) ? designSystemsTrack : null;

const SOURCES: Partial<Record<FeedSourceId, NormalizedPosting['source']>> = {
  greenhouse: 'greenhouse',
  lever: 'lever',
  ashby: 'ashby',
  remotive: 'remotive',
  hn: 'hn',
};

export function toNormalized(p: Posting): NormalizedPosting {
  return {
    // Boards the scorer has no name for rank like a hand-added posting (score.ts dedupe).
    source: SOURCES[p.source] ?? 'manual',
    sourceId: p.id,
    title: p.title,
    company: p.company,
    location: p.location || undefined,
    remote: p.mode === 'remote' || undefined,
    url: p.url,
    descriptionText: p.text,
    postedAt: p.postedAt,
  };
}

export type Scored<P> = P & { trackScore: ScoreResult };

/** Score every posting: the queued ones (best score first, then newest), the ones held for review
 *  (same order), and how many were rejected. */
export function scoreAll<P extends Posting>(
  postings: P[],
  track: TrackConfig,
): { queue: Scored<P>[]; review: Scored<P>[]; rejected: number } {
  const queue: Scored<P>[] = [];
  const review: Scored<P>[] = [];
  let rejected = 0;
  for (const p of postings) {
    const trackScore = p.trackScore ?? scoreForTrack(toNormalized(p), track);
    if (trackScore.verdict === 'reject') rejected++;
    else (trackScore.verdict === 'queue' ? queue : review).push({ ...p, trackScore });
  }
  const order = (a: Scored<P>, b: Scored<P>) =>
    byScoreThenNewest(
      { score: a.trackScore.score, postedAt: a.postedAt },
      { score: b.trackScore.score, postedAt: b.postedAt },
    );
  return { queue: queue.sort(order), review: review.sort(order), rejected };
}

/** What a list keeps under the track's rule: the queued postings on a scored track, else the
 *  must-include phrase filter. */
export function keepForTrack<P extends Posting>(postings: P[], rule: IncludeRule): P[] {
  const track = scorerFor(rule);
  return track ? scoreAll(postings, track).queue : keepIncluded(postings, rule);
}
