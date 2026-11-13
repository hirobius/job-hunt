// A sideways swipe that steps a walk (Proposal A: "swipe left and right on the card"): the Apply
// job's pager (the Find Deck that shared it went in #714). Only a clear sideways swipe of 64px or more counts, never one
// that starts in a field or in something that scrolls sideways itself. `.rjb-swipe` (base.css) keeps
// the page's own up-and-down scroll.
import { useRef, type ReactNode, type TouchEvent } from 'react';
import { Box } from '@hirobius/design-system';

/** True when `el` is inside something that scrolls sideways (below `root`): its own swipe. */
function inSideScroller(el: Element, root: Element): boolean {
  for (let n: Element | null = el; n && n !== root; n = n.parentElement) {
    const x = getComputedStyle(n).overflowX;
    if ((x === 'auto' || x === 'scroll') && n.scrollWidth > n.clientWidth) return true;
  }
  return false;
}

/** A horizontal swipe on the job steps the pager (Proposal A: "swipe left and right on the card").
 *  Only a clear sideways swipe of 64px or more counts, never one that starts in a field. */
export function SwipeArea({
  onPrev,
  onNext,
  children,
}: {
  onPrev: () => void;
  onNext: () => void;
  children: ReactNode;
}) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return (
    <Box
      className="rjb-swipe"
      onTouchStart={(e: TouchEvent<HTMLDivElement>) => {
        const t = e.touches[0];
        const from = e.target as Element;
        const field = from.closest('input, textarea, [contenteditable="true"]');
        start.current =
          t && !field && !inSideScroller(from, e.currentTarget)
            ? { x: t.clientX, y: t.clientY }
            : null;
      }}
      onTouchEnd={(e: TouchEvent<HTMLDivElement>) => {
        const s = start.current;
        const t = e.changedTouches[0];
        start.current = null;
        if (!s || !t) return;
        // Selecting text drags sideways too: that is not a swipe.
        if (window.getSelection()?.toString()) return;
        const dx = t.clientX - s.x;
        const dy = t.clientY - s.y;
        if (Math.abs(dx) < 64 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
        if (dx < 0) onNext();
        else onPrev();
      }}
    >
      {children}
    </Box>
  );
}
