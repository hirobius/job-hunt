// The Feed's read seam (simplify 5/9, #386): a `PostingReader` turns a request (the profile's
// titles, the Sources' boards) into raw Postings and a status per source. Two adapters: the
// browser one here, over today's `fetchFeed` (every term source once per title, every board once,
// failures isolated and named), for a signed-out visit; the server `postings` table is #387.
// Everything after the read is the same for both (feed.ts).
import {
  fetchFeed,
  liveFetchJson,
  type FeedProgress,
  type FeedResult,
  type KeyValue,
  type SOURCE_ENABLED,
} from './fetchFeed';
import type { FetchJson } from './sources/http';

export interface FeedRequest {
  /** Every title to search the term sources for (the wide sweep). */
  terms: string[];
  /** Every board link to read. */
  boardUrls: string[];
}

export interface PostingReader {
  read(req: FeedRequest, onProgress?: (p: FeedProgress) => void): Promise<FeedResult>;
}

/** The browser adapter: today's fetchFeed, one sweep over every title, every board read once. */
export function browserReader(
  fetchJson: FetchJson = liveFetchJson,
  opts: { kv?: KeyValue; now?: () => number; sources?: Partial<typeof SOURCE_ENABLED> } = {},
): PostingReader {
  return {
    read: (req, onProgress) =>
      fetchFeed({ terms: req.terms, boardUrls: req.boardUrls, onProgress }, fetchJson, opts),
  };
}
