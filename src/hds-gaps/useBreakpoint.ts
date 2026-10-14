// HDS gap (#115): HDS lays out with CSS only (Sidebar, Switcher, Grid wrap by width), but the
// Pipeline renders different markup per viewport: a Table at desktop, cards on a phone. This reads
// an HDS breakpoint through matchMedia. With no matchMedia (jsdom, old browsers) it reports the
// narrow layout, which works at every width. Filed with the Phase 7 asks (#133).
import { useSyncExternalStore } from 'react';
import hds from '@hirobius/design-system/tokens';

type Breakpoint = 'sm' | 'md' | 'lg';

const queryOf = (bp: Breakpoint) => `(min-width: ${hds.breakpoints[bp]}px)`;

/** True while the viewport is at least the HDS breakpoint `bp` wide. */
export function useAtLeast(bp: Breakpoint): boolean {
  const query = queryOf(bp);
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window.matchMedia !== 'function') return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener?.('change', onChange);
      return () => mql.removeEventListener?.('change', onChange);
    },
    () => typeof window.matchMedia === 'function' && window.matchMedia(query).matches,
    () => false,
  );
}
