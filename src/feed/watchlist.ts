// "Watch a company" — the feed's board list IS the track's curated tiles: any tile whose URL is a
// Greenhouse/Lever/Ashby board gets pulled live. Watching from the feed just files that tile into
// a "Watched companies" group on the active track, so it syncs to the cloud with the rest of the
// curation and can be removed in Manage track like any other link.
import { addGroup, addTile, getCurationState } from '../curation/curationStore';
import type { CurationState } from '../curation/types';
import { SOURCE_LABEL } from './types';
import { boardLabel, canonicalBoardUrl, parseBoardUrl } from './sources/ats';

export const WATCH_GROUP_LABEL = 'Watched companies';

export type WatchResult = { ok: true; label: string } | { ok: false; error: string };

const NOT_A_BOARD =
  "That isn't a Greenhouse, Lever or Ashby job board. Open the company's careers page and copy the board link — " +
  'it looks like jobs.ashbyhq.com/company, jobs.lever.co/company or boards.greenhouse.io/company.';

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
