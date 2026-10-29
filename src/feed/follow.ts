// Saving follows the company (simplify spec): a posting read from a board adds that board to the
// Sources (one already there stays as it is); any other posting follows its company by name.
// Returns the undo, so a save's Undo also takes the follow back.
import { addSources, getSources, removeSource, sourceKey, type Source } from '../sources';
import { followCompany } from './decided';
import { boardKeyOf } from './feed';
import type { Posting } from './types';

export function followPosting(p: Pick<Posting, 'id' | 'company'>): () => void {
  const board = boardKeyOf(p.id);
  if (board) {
    const [kind, slug] = board.split(':');
    // Not a kind Sources keep (a posting id from a feed): follow by name instead.
    const s = { kind, ref: slug, label: p.company.trim() || slug } as Source;
    const k = sourceKey(s);
    if (getSources().some((x) => sourceKey(x) === k)) return () => {};
    if (addSources([s])) return () => removeSource(k);
  }
  return followCompany(p.company);
}
