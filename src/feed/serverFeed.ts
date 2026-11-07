// Review new for a signed-in person reads the server's rows (2026-11-07, option 2 after the phone
// profile): the sync edge function reads their Sources every 15 minutes and stores the scored
// postings (tracks/postings.ts), so the browser skips its own sweep of every followed board, which
// on a phone held the main thread for most of a minute. A read that fails, or finds no rows yet (a
// new account before its first sync), falls back to the browser read, so nobody sees less than
// before. Rows carry no text: a posting's text is fetched when it is opened (postingText.ts).
import { loadServerRows, type StoredPosting } from '../tracks/postings';
import { postingFromRow } from './postingReader';
import type { FeedResult, SourceStatus } from './fetchFeed';
import type { PostingReader } from './reader';
import { SOURCE_LABEL, type Posting } from './types';

/** The rows as a Feed result: one source status per company and source the rows came from. */
export function resultFromRows(rows: StoredPosting[]): FeedResult {
  const postings = rows.map(postingFromRow).filter((p): p is Posting => p !== null);
  const sources = new Map<string, SourceStatus>();
  for (const p of postings) {
    const key = `server:${p.source}:${p.company.toLowerCase()}`;
    const s = sources.get(key);
    if (s) s.fetched++;
    else
      sources.set(key, {
        key,
        label: `${p.company || 'Unknown'} (${SOURCE_LABEL[p.source]})`,
        fetched: 1,
      });
  }
  return { postings, sources: [...sources.values()] };
}

/** Server rows first; the browser read when there are none or the server can't be read. */
export function serverFirstReader(
  fallback: PostingReader,
  load: () => Promise<StoredPosting[]> = loadServerRows,
): PostingReader {
  return {
    async read(req, onProgress) {
      const rows = await load().catch(() => null);
      if (rows && rows.length) return resultFromRows(rows);
      return fallback.read(req, onProgress);
    },
  };
}
