// HDS gap (#115): HDS lays out with CSS only (Sidebar, Switcher, Grid wrap by width), but the
// Pipeline renders different markup per viewport: a Table at desktop, cards on a phone. This reads
// an HDS breakpoint through matchMedia. With no matchMedia (jsdom, old browsers) it reports the
// narrow layout, which works at every width. Upstream ask: hds#824.
import { useCallback, useSyncExternalStore } from 'react';
import hds from '@hirobius/design-system/tokens';

type Breakpoint = 'sm' | 'md' | 'lg';

const hasMatchMedia = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function';

/** True while the viewport is at least the HDS breakpoint `bp` wide. */
export function useAtLeast(bp: Breakpoint): boolean {
  const query = `(min-width: ${hds.breakpoints[bp]}px)`;
  // Stable per query, so useSyncExternalStore doesn't resubscribe on every render.
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!hasMatchMedia()) return () => {};
      const mql = window.matchMedia(query);
      // Safari < 14 has only the deprecated addListener.
      if (mql.addEventListener) mql.addEventListener('change', onChange);
      else mql.addListener?.(onChange);
      return () => {
        if (mql.removeEventListener) mql.removeEventListener('change', onChange);
        else mql.removeListener?.(onChange);
      };
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => hasMatchMedia() && window.matchMedia(query).matches,
    () => false,
  );
}
