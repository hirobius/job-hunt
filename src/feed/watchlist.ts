// "Watch a company" — the feed's board list IS the track's curated tiles: any tile whose URL is a
// Greenhouse/Lever/Ashby/Workable/Recruitee/SmartRecruiters/Teamtailor/Personio board gets pulled live. Watching from the feed just files that tile into
// a "Watched companies" group on the active track, so it syncs to the cloud with the rest of the
// curation and can be removed in Manage track like any other link.
import { addGroup, addTile, addTiles, getCurationState } from '../curation/curationStore';
import type { CurationState } from '../curation/types';
import { SOURCE_LABEL } from './types';
import {
  boardLabel,
  boardsFromUrls,
  canonicalBoardUrl,
  parseBoardUrl,
  type Board,
} from './sources/ats';

export const WATCH_GROUP_LABEL = 'Watched companies';

export type WatchResult = { ok: true; label: string } | { ok: false; error: string };

const NOT_A_BOARD =
  "That isn't a Greenhouse, Lever, Ashby, Workable, Recruitee, SmartRecruiters, Teamtailor or Personio job board. Open the company's careers page and copy the board link — " +
  'it looks like jobs.ashbyhq.com/company, jobs.lever.co/company, boards.greenhouse.io/company, apply.workable.com/company, company.recruitee.com, ' +
  'jobs.smartrecruiters.com/company, company.teamtailor.com or company.jobs.personio.de.';

/** Every tile URL on the track's live (non-archived) groups — the feed picks the boards out. */
export function boardUrlsFor(categoryId: string, s: CurationState = getCurationState()): string[] {
  const groupIds = new Set(
    s.groups.filter((g) => g.categoryId === categoryId && !g.archived).map((g) => g.id),
  );
  return s.tiles.filter((t) => groupIds.has(t.groupId)).map((t) => t.url);
}

export function watchBoard(categoryId: string, rawUrl: string): WatchResult {
  const board = parseBoardUrl(rawUrl.trim());
  if (!board) return { ok: false, error: NOT_A_BOARD };
  const label = boardLabel(board);

  const s = getCurationState();
  const same = (u: string) => {
    const b = parseBoardUrl(u);
    return !!b && b.kind === board.kind && b.slug.toLowerCase() === board.slug.toLowerCase();
  };
  if (boardUrlsFor(categoryId, s).some(same))
    return { ok: false, error: `Already watching ${label}.` };

  const group =
    s.groups.find(
      (g) => g.categoryId === categoryId && !g.archived && g.label === WATCH_GROUP_LABEL,
    )?.id ?? addGroup(categoryId, { label: WATCH_GROUP_LABEL });
  addTile(group, {
    name: `${label} jobs`,
    url: canonicalBoardUrl(board),
    meta: `${SOURCE_LABEL[board.kind]} board · pulled into Live postings`,
  });
  return { ok: true, label };
}

const sameBoard = (a: Board, b: Board) =>
  a.kind === b.kind && a.slug.toLowerCase() === b.slug.toLowerCase();

/** Board urls (from `urls`) the track isn't watching yet, one per distinct board; non-boards drop. */
function unwatched(categoryId: string, urls: readonly string[]): { url: string; board: Board }[] {
  const have = boardsFromUrls(boardUrlsFor(categoryId), Infinity);
  const out: { url: string; board: Board }[] = [];
  for (const url of urls) {
    const board = parseBoardUrl(url);
    if (
      !board ||
      have.some((b) => sameBoard(b, board)) ||
      out.some((o) => sameBoard(o.board, board))
    )
      continue;
    out.push({ url, board });
  }
  return out;
}

/** How many of `urls` an "Add suggested companies" click would add. */
export const countUnwatched = (categoryId: string, urls: readonly string[]): number =>
  unwatched(categoryId, urls).length;

/** File many boards as watched tiles at once (one "Watched companies" group). Idempotent: boards
 *  the track already watches, and links that aren't boards, are skipped. Returns how many it added. */
export function addBoardTiles(categoryId: string, urls: readonly string[]): number {
  const fresh = unwatched(categoryId, urls);
  if (fresh.length === 0) return 0;
  const s = getCurationState();
  const group =
    s.groups.find(
      (g) => g.categoryId === categoryId && !g.archived && g.label === WATCH_GROUP_LABEL,
    )?.id ?? addGroup(categoryId, { label: WATCH_GROUP_LABEL });
  // One bulk write: a pack's ~120 boards go up as a few requests, not one per tile (#178).
  addTiles(
    group,
    // addTiles numbers them after the group's last tile.
    fresh.map(({ board }) => ({
      name: `${boardLabel(board)} jobs`,
      url: canonicalBoardUrl(board),
      meta: `${SOURCE_LABEL[board.kind]} board · pulled into Live postings`,
    })),
  );
  return fresh.length;
}
