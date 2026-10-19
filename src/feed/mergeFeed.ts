// Fold the result of re-reading a few sources (a per-source Retry) into the result already on
// screen: the retried sources' statuses replace the old ones, their postings are added (never
// duplicated). Kept out of fetchFeed.ts so UI tests that mock that module still get it.
import type { FeedResult } from './fetchFeed';

export function mergeRetry(prev: FeedResult, patch: FeedResult): FeedResult {
  const seen = new Set(prev.postings.map((p) => p.id));
  return {
    postings: [...prev.postings, ...patch.postings.filter((p) => !seen.has(p.id))],
    sources: prev.sources.map((s) => patch.sources.find((n) => n.key === s.key) ?? s),
  };
}
