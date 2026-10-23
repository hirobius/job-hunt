// Shared by the companies list's files (OutreachRows.tsx, CompaniesPanel.tsx, AddCompany.tsx): the
// list style and the watch action. Kept out of the .tsx so those files export components only.
import { useMemo } from 'react';
import { useToast } from '@hirobius/design-system';
import { boardsFromUrls, canonicalBoardUrl, type Board } from './feed/sources/ats';
import { watchBoard } from './feed/watchlist';

export const listStyle = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'grid',
  gap: 'var(--primitive-space-3)',
} as const;


/** Hook: what the track already watches and the watch action, shared by both surfaces. */
export function useWatching(categoryId: string, boardUrls: string[]) {
  const { toast } = useToast();
  const watched = useMemo(() => boardsFromUrls(boardUrls, Infinity), [boardUrls]);
  const isWatching = (b?: Board) =>
    !!b && watched.some((w) => w.kind === b.kind && w.slug.toLowerCase() === b.slug.toLowerCase());
  const watch = (b: Board) => {
    const r = watchBoard(categoryId, canonicalBoardUrl(b));
    if (r.ok)
      toast({
        title: `Watching ${r.label}`,
        description: 'Its open roles now show on Companies and in Live postings.',
        tone: 'success',
      });
    else toast({ title: r.error, tone: 'warning' });
  };
  return { isWatching, watch };
}
