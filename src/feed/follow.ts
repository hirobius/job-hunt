// Saving follows the company (simplify spec): a posting read from a board follows that board as a
// Source (sources.ts `followBoard`: added when missing, a mute on it or its company lifted); any
// other posting follows its company by name. Returns the undo, so a save's Undo also takes the
// follow back.
import { followBoard } from '../sources';
import { isBoardKind, type SourceKind } from '../sourcesModel';
import { followCompany } from './decided';
import { parseBoardUrl, type Board } from './sources/ats';
import type { Posting } from './types';

export function followPosting(p: Pick<Posting, 'id' | 'company' | 'url'>): () => void {
  // The board from the posting's own link keeps its slug's case and Lever's EU host; a board
  // posting's id (`kind:slug:job`, slug lower-cased) is the fallback when its link is elsewhere.
  const [kind, slug, job] = p.id.split(':');
  const fromId: Board | null =
    job && slug && isBoardKind(kind as SourceKind) ? ({ kind, slug } as Board) : null;
  const linked = parseBoardUrl(p.url);
  const board = linked && (!fromId || linked.kind === fromId.kind) ? linked : fromId;
  if (board) return followBoard(board, p.company.trim() || board.slug).undo;
  return followCompany(p.company);
}
