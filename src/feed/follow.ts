// Saving follows the company (simplify spec): a posting read from a board watches that board on
// the track (a dream's or a target's board becomes a watched tile; a tile already watched stays
// as it is); any other posting follows its company by name (decided.ts, until #384's Sources).
// Returns the undo, so a save's Undo also takes the follow back.
import { getCurationState, removeTile } from '../curation/curationStore';
import { boardUrlsFor, watchBoard } from './watchlist';
import { boardsFromUrls, parseBoardUrl } from './sources/ats';
import { companyKey, followCompany, getAllDecided, hasCompany, unfollowCompany } from './decided';
import { boardKeyOf } from './feed';
import type { Source } from './profile';
import type { Posting } from './types';

const keyOfUrl = (url: string) => {
  const b = parseBoardUrl(url);
  return b ? `${b.kind}:${b.slug.toLowerCase()}` : null;
};

export function followPosting(
  p: Pick<Posting, 'id' | 'company'>,
  categoryId: string,
  sources: Source[],
): () => void {
  const board = boardKeyOf(p.id);
  const ref = board && sources.find((s) => s.kind === 'board' && keyOfUrl(s.ref) === board)?.ref;
  if (ref) {
    const watched = boardsFromUrls(boardUrlsFor(categoryId), Infinity).some(
      (b) => `${b.kind}:${b.slug.toLowerCase()}` === board,
    );
    if (watched) return () => {};
    const before = new Set(getCurationState().tiles.map((t) => t.id));
    if (!watchBoard(categoryId, ref).ok) return () => {};
    const added = getCurationState().tiles.filter((t) => !before.has(t.id));
    return () => added.forEach((t) => removeTile(t.id));
  }
  const k = companyKey(p.company);
  if (!k || hasCompany(getAllDecided().followed, p.company)) return () => {};
  followCompany(p.company);
  return () => unfollowCompany(p.company);
}
