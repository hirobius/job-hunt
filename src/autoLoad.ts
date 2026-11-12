// Find's Browse list loads its next page on its own (2026-11-12): a sentinel about one viewport
// before the end. Off where IntersectionObserver is missing and under prefers-reduced-data; the
// "Load more (N)" key stays as the fallback (and for keyboard users), so focus never jumps.
import { useEffect, useRef } from 'react';

export function autoLoadSupported(): boolean {
  if (typeof window === 'undefined' || typeof window.IntersectionObserver !== 'function')
    return false;
  try {
    return !window.matchMedia?.('(prefers-reduced-data: reduce)').matches;
  } catch {
    return true;
  }
}

/** A ref for the sentinel: `onMore` runs as it comes within one viewport; the observer is
 *  disconnected on unmount or when `on` turns false. */
export function useAutoLoad(on: boolean, onMore: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  const more = useRef(onMore);
  useEffect(() => {
    more.current = onMore;
  });
  useEffect(() => {
    const el = ref.current;
    if (!on || !el || !autoLoadSupported()) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) more.current();
      },
      { rootMargin: '0px 0px 100% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [on]);
  return ref;
}
