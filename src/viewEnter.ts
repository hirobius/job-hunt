import { useEffect, useRef, type RefObject } from 'react';

/** Replays the view-enter motion (base.css .rjb-view-enter, #279) on `el` without remounting it.
 *  Keying the page stack by route remounts the stateful subtree, which drops focus and resets
 *  pager state on in-place hops (rail, Apply pager, Not a fit). Instead the stack stays mounted
 *  and only the animation restarts: drop the class, force a reflow, add it back. */
export function replayViewEnter(el: HTMLElement | null): void {
  if (!el) return;
  el.classList.remove('rjb-view-enter');
  void el.offsetWidth; // flush style so the animation restarts
  el.classList.add('rjb-view-enter');
}

/** Replays the enter motion whenever `kind` changes (not on first mount, where the class's own
 *  animation already runs). `kind` is the page kind, e.g. the route's tab, never a per-item id. */
export function useViewEnter(ref: RefObject<HTMLElement | null>, kind: string): void {
  const last = useRef(kind);
  useEffect(() => {
    if (last.current === kind) return;
    last.current = kind;
    replayViewEnter(ref.current);
  }, [ref, kind]);
}
