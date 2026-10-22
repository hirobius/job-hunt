// Where a page's Back goes and what it is called (return paths): the hook behind BackLink, for the
// few Backs that draw themselves (the editor's "All documents", Back to companies).
import { createContext, useContext, useMemo, type MouseEvent } from 'react';
import { buildHash, goBackTo, parseHash, useRoute, type Route } from './route';
import { useRouteLabel } from './routeLabel';

export interface Back {
  /** Where Back goes: the recorded origin, else the page's default. */
  origin: Route;
  /** True when the route recorded where it was opened from. */
  recorded: boolean;
  /** The name Back shows. */
  label: string;
  href: string;
  go: () => void;
}

/** A page with work that a Back would lose (the document editor's unsaved text) wraps its Back in
 *  this: Back hands its `go` to the guard, which can ask first and run it later. */
export const BackGuard = createContext<((go: () => void) => void) | null>(null);

/** Where the current page's Back goes, and what it is called. `sameAs` names pages that show the
 *  same view as the fallback (Companies at `#/discover` and `#/discover/teams`). */
export function useBack(fallback: Route, fallbackLabel: string, sameAs: Route[] = []): Back {
  const route = useRoute();
  const from = route.from ?? null;
  const recorded = useMemo(() => (from ? parseHash('#' + from) : null), [from]);
  const origin = recorded ?? fallback;
  const named = useRouteLabel(origin);
  const guard = useContext(BackGuard);
  const go = () => goBackTo(recorded ? origin : [fallback, ...sameAs]);
  return {
    origin,
    recorded: !!recorded,
    label: recorded ? named : fallbackLabel,
    href: buildHash(origin),
    go: () => (guard ? guard(go) : go()),
  };
}

/** A link's plain left click runs `go` in place of following the href; a modified click (new tab,
 *  new window) still opens the link as the browser would. */
export function inPlaceClick(go: () => void) {
  return (e: MouseEvent<HTMLElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
      return;
    e.preventDefault();
    go();
  };
}

/** A Back link's click: go back in place (see goBackTo). */
export const backClick = (back: Back) => inPlaceClick(back.go);
