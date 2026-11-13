// Find's Browse list renders a window of cards around the viewport (memory audit, 2026-11-13: a
// long session kept every loaded card mounted, ~85 kB and ~75 elements a card at 390). Cards
// outside the window are spacers that hold their measured heights (cached by key across mounts,
// unmeasured ones at the running mean), so the page's height and scrollMemory's exact restore do
// not move. The card holding focus and the selected card are never unmounted. Cards outside the
// window are not in the Tab order and not found by the browser's find-in-page.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/** Cards mounted around the viewport. */
export const WINDOW_SIZE = 100;
/** The window moves in steps of this many cards, so a scroll re-renders rarely. */
export const WINDOW_STEP = 20;
/** A card's height before any card has been measured (a compact Browse card at 390). */
export const ESTIMATE_PX = 240;

/** Measured heights by key, kept for the page load so a list mounted again lays out as before. */
const heights = new Map<string, number>();
let sum = 0;

export function rememberHeight(key: string, h: number) {
  if (!(h > 0)) return;
  const old = heights.get(key);
  if (old === h) return;
  sum += h - (old ?? 0);
  heights.set(key, h);
}

/** A key's height: measured, else the mean of what has been measured, else ESTIMATE_PX. */
export function heightOf(key: string): number {
  const h = heights.get(key);
  if (h !== undefined) return h;
  return heights.size ? sum / heights.size : ESTIMATE_PX;
}

/** Tests only. */
export function resetHeights() {
  heights.clear();
  sum = 0;
}

/** The window [start, end) holding `size` items around the item at `center` px (list
 *  coordinates), its start rounded down to `step`. */
export function windowAt(
  count: number,
  height: (i: number) => number,
  gap: number,
  center: number,
  size = WINDOW_SIZE,
  step = WINDOW_STEP,
): { start: number; end: number } {
  if (count <= size) return { start: 0, end: count };
  let i = 0;
  let y = 0;
  while (i < count - 1 && y + height(i) + gap <= center) {
    y += height(i) + gap;
    i++;
  }
  const raw = Math.max(0, i - Math.floor(size / 2));
  const start = Math.min(Math.floor(raw / step) * step, count - size);
  return { start: Math.max(0, start), end: Math.min(count, start + size) };
}

export type Segment = { kind: 'item'; index: number } | { kind: 'spacer'; key: string; px: number };

/** The rows to draw: the window and the pinned items, each run of the rest one spacer as tall as
 *  its items and the gaps between them (the spacer takes one gap of its own in the list). */
export function segmentsOf(
  count: number,
  win: { start: number; end: number },
  pinned: ReadonlySet<number>,
  height: (i: number) => number,
  gap: number,
): Segment[] {
  const out: Segment[] = [];
  let run: number[] = [];
  const flush = () => {
    if (!run.length) return;
    const px = run.reduce((t, i) => t + height(i), 0) + gap * (run.length - 1);
    out.push({ kind: 'spacer', key: `gap-${run[0]}`, px });
    run = [];
  };
  for (let i = 0; i < count; i++) {
    if ((i >= win.start && i < win.end) || pinned.has(i)) {
      flush();
      out.push({ kind: 'item', index: i });
    } else run.push(i);
  }
  flush();
  return out;
}

export function windowingSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.ResizeObserver === 'function';
}

/** Windowing for a page-scrolled list of `keys`. `listRef` goes on the list; `itemRef(key)` on
 *  each item (it is measured while mounted). `keep` are keys that must stay mounted. */
export function useWindowedList(keys: string[], keep: (string | null | undefined)[]) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const [win, setWin] = useState({ start: 0, end: Math.min(keys.length, WINDOW_SIZE) });
  const [, setVersion] = useState(0);
  const [focused, setFocused] = useState<string | null>(null);
  const [gap, setGap] = useState(0);
  const gapRef = useRef(0);
  const ro = useRef<ResizeObserver | null>(null);
  const on = windowingSupported() && keys.length > WINDOW_SIZE;
  const keysRef = useRef(keys);
  useLayoutEffect(() => {
    keysRef.current = keys;
  });

  const recompute = useCallback(() => {
    const list = listRef.current;
    const ks = keysRef.current;
    if (!list) return;
    const top = list.getBoundingClientRect().top;
    const center = window.innerHeight / 2 - top;
    const next = windowAt(ks.length, (i) => heightOf(ks[i]), gapRef.current, center);
    setWin((w) => (w.start === next.start && w.end === next.end ? w : next));
  }, []);

  // One ResizeObserver for every mounted item, made on the first item's ref (refs attach before
  // effects run); disconnected on unmount.
  const observer = useCallback(() => {
    if (ro.current || !windowingSupported()) return ro.current;
    ro.current = new ResizeObserver((entries) => {
      let changed = false;
      for (const e of entries) {
        const key = (e.target as HTMLElement).dataset.windowKey;
        const h = (e.target as HTMLElement).getBoundingClientRect().height;
        if (key && h > 0 && heightOf(key) !== h) {
          rememberHeight(key, h);
          changed = true;
        }
      }
      if (changed) setVersion((v) => v + 1);
    });
    return ro.current;
  }, []);
  useEffect(
    () => () => {
      ro.current?.disconnect();
      ro.current = null;
    },
    [],
  );

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!on || !list) return;
    gapRef.current = parseFloat(getComputedStyle(list).rowGap) || 0;
    setGap(gapRef.current);
    recompute();
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        recompute();
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [on, keys.length, recompute]);

  // The card holding focus stays mounted while focus is in it.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const keyIn = (el: EventTarget | null) =>
      el instanceof Element
        ? ((el.closest('[data-window-key]') as HTMLElement | null)?.dataset.windowKey ?? null)
        : null;
    const onIn = (e: FocusEvent) => setFocused(keyIn(e.target));
    const onOut = (e: FocusEvent) => {
      if (!(e.relatedTarget instanceof Node) || !list.contains(e.relatedTarget)) {
        // Focus went outside the list, or nowhere yet (a click on the page): keep the pin while
        // the element still holds focus.
        requestAnimationFrame(() => {
          if (!list.contains(document.activeElement)) setFocused(null);
        });
      }
    };
    list.addEventListener('focusin', onIn);
    list.addEventListener('focusout', onOut);
    return () => {
      list.removeEventListener('focusin', onIn);
      list.removeEventListener('focusout', onOut);
    };
  }, []);

  const itemRef = useCallback(
    (key: string) => (el: HTMLElement | null) => {
      if (!el) return undefined;
      el.dataset.windowKey = key;
      const obs = observer();
      obs?.observe(el);
      return () => obs?.unobserve(el);
    },
    [observer],
  );

  const all = { start: 0, end: keys.length };
  const pinned = new Set<number>();
  if (on)
    for (const k of [...keep, focused]) {
      const i = k ? keys.indexOf(k) : -1;
      if (i >= 0) pinned.add(i);
    }
  const segments = segmentsOf(
    keys.length,
    on ? { start: win.start, end: Math.min(win.end, keys.length) } : all,
    pinned,
    (i) => heightOf(keys[i]),
    gap,
  );
  return { listRef, itemRef, segments };
}

/** Sets a spacer's height through a custom property (no inline style literal). */
export function spacerRef(px: number) {
  return (el: HTMLElement | null) => {
    el?.style.setProperty('--rjb-spacer-h', `${px}px`); // hds-allow: measured card heights, not a spacing value
  };
}
