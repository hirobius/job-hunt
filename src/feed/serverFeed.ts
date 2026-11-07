// Review new for a signed-in person reads the server's rows (2026-11-07, option 2 after the phone
// profile): the sync edge function reads their Sources every 15 minutes and stores the scored
// postings (tracks/postings.ts), so the browser skips its own sweep of every followed board, which
// on a phone held the main thread for most of a minute. A read that fails, or finds no rows yet (a
// new account before its first sync), falls back to the browser read, so nobody sees less than
// before. Rows carry no text: a posting's text is fetched when it is opened (postingText.ts).
import { loadServerRows, type StoredPosting } from '../tracks/postings';
import { postingFromRow } from './postingReader';
import type { FeedResult, SourceStatus } from './fetchFeed';
import type { FeedRequest, PostingReader } from './reader';
import { BOARD_KINDS, setBoardKey } from './boardSet';
import { parseBoardUrl } from './sources/ats';
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

/** Is a row in the request: a board's when the request reads that board, a feed's (HN, Remotive,
 *  the server's searches) when it searches any title. A row from before the board column counts as
 *  in. */
export function rowInRequest(r: StoredPosting, req: FeedRequest): boolean {
  if (!r.board) return true;
  const kind = r.board.split(':')[0];
  if (!BOARD_KINDS.includes(kind.replace(/\.eu$/, '') as never)) return req.terms.length > 0;
  return boardKeys(req.boardUrls).has(r.board.toLowerCase());
}

const boardKeys = (urls: string[]) =>
  new Set(
    urls.flatMap((u) => {
      const b = parseBoardUrl(u);
      return b ? [setBoardKey(b)] : [];
    }),
  );

/** Server rows first, the ones the request asks for (its boards; its feeds when it searches a
 *  title); the browser read when the server has none or can't be read. Says its progress once, as
 *  a read that answered whole. */
export function serverFirstReader(
  fallback: PostingReader,
  load: () => Promise<StoredPosting[]> = loadServerRows,
): PostingReader {
  return {
    async read(req, onProgress) {
      const rows = await load().catch(() => null);
      if (!rows || !rows.length) return fallback.read(req, onProgress);
      const result = resultFromRows(rows.filter((r) => rowInRequest(r, req)));
      const boards = req.boardUrls.length;
      onProgress?.({ ...result, boardsDone: boards, boardsTotal: boards });
      return result;
    },
  };
}
