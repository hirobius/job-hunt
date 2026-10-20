// HDS gap (#115): a strip of options that scrolls sideways on a phone needs an edge cue and keeps
// the selected option in view. HDS 0.26.1 fades TabsList's hidden edge itself (hds#723), so for a
// tab list this wrapper only scrolls the selected tab into view (Radix doesn't). A SegmentedControl
// (Discover's tools on a phone) scrolls the same way with no cue, so there it also fades whichever
// edge has more to scroll past. Asks (docs/hds-upstream-asks-0.9.md): TabsList scrolls its
// selected tab into view, and SegmentedControl gets the same overflow fade. Delete this when both land.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

// Mask alpha only: currentColor is opaque, so an edge fades to transparent without a colour.
const EDGE = 'var(--primitive-space-10)';
const mask = (start: boolean, end: boolean) =>
  `linear-gradient(to right, ${start ? `transparent, currentColor ${EDGE}` : 'currentColor 0'}, ${
    end ? `currentColor calc(100% - ${EDGE}), transparent` : 'currentColor 100%'
  })`;

const SCROLLER = '[role="tablist"],[role="radiogroup"]';
const tablistIn = (root: HTMLElement | null) => root?.querySelector<HTMLElement>(SCROLLER) ?? null;
/** Only a radiogroup needs our fade: HDS TabsList draws its own. */
const fadesHere = (list: HTMLElement | null) => list?.getAttribute('role') === 'radiogroup';

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
    const own = !!list && fadesHere(list);
    const start = own && list.scrollLeft > 1;
    const end = own && list.scrollLeft + list.clientWidth < list.scrollWidth - 1;
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
