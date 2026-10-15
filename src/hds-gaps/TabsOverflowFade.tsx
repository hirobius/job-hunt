// HDS gap (#115): TabsList scrolls sideways when its tabs don't fit, with the scrollbar hidden and
// no cue that more tabs sit past the edge (the four top tabs overflow a 390px phone). This wrapper
// fades whichever edge has more to scroll past, and keeps the selected tab in view
// (Radix doesn't scroll to it). Filed upstream with the Phase 7 asks (#133); delete this when
// TabsList grows an overflow cue. Also wraps a SegmentedControl (its radiogroup scrolls the same
// way, e.g. Discover's four tools on a phone): the ask is an `overflow` prop on both.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

// Mask alpha only: currentColor is opaque, so an edge fades to transparent without a colour.
const EDGE = 'var(--primitive-space-10)';
const mask = (start: boolean, end: boolean) =>
  `linear-gradient(to right, ${start ? `transparent, currentColor ${EDGE}` : 'currentColor 0'}, ${
    end ? `currentColor calc(100% - ${EDGE}), transparent` : 'currentColor 100%'
  })`;

const SCROLLER = '[role="tablist"],[role="radiogroup"]';
const tablistIn = (root: HTMLElement | null) =>
  root?.querySelector<HTMLElement>(SCROLLER) ?? null;

export default function TabsOverflowFade({
  value,
  children,
}: {
  /** The selected tab's value; when it changes, that tab scrolls into view. */
  value?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  const measure = useCallback(() => {
    const list = tablistIn(ref.current);
    const start = !!list && list.scrollLeft > 1;
    const end = !!list && list.scrollLeft + list.clientWidth < list.scrollWidth - 1;
    setEdges((e) => (e.start === start && e.end === end ? e : { start, end }));
  }, []);
  const fade = edges.start || edges.end ? mask(edges.start, edges.end) : undefined;

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined' || !ref.current) return;
    // The wrapper's width (viewport) and the tab list's own (labels re-measure once fonts load).
    const ro = new ResizeObserver(measure);
    ro.observe(ref.current);
    const list = tablistIn(ref.current);
    if (list) ro.observe(list);
    return () => ro.disconnect();
  }, [measure]);

  useEffect(() => {
    tablistIn(ref.current)
      ?.querySelector<HTMLElement>('[aria-selected="true"],[aria-checked="true"]')
      ?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    measure();
  }, [value, measure]);

  return (
    <div
      ref={ref}
      data-overflow={
        fade ? (edges.start && edges.end ? 'both' : edges.start ? 'start' : 'end') : undefined
      }
      onScrollCapture={measure}
      style={fade ? { maskImage: fade, WebkitMaskImage: fade } : undefined}
    >
      {children}
    </div>
  );
}
