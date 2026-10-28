// Focus stays where the work is (job page audit, 2026-10-27): an inline editor that closes, or a
// row that goes, hands focus to a named control instead of dropping it to <body>, so a keyboard or
// screen reader user keeps their place.
import { useCallback, useEffect, useRef, useState } from 'react';

/** `ref(key)` registers a control; `focus(key)` focuses it as soon as it is on screen (in the
 *  commit that renders it, when it is not there yet). */
export function useFocusAfter() {
  const els = useRef(new Map<string, HTMLElement>());
  const want = useRef<string | null>(null);
  const [, rerender] = useState(0);
  // After every commit: the control asked for may only now be on screen.
  useEffect(() => {
    const el = want.current && els.current.get(want.current);
    if (!el) return;
    el.focus();
    want.current = null;
  });
  const ref = useCallback(
    (key: string) => (el: HTMLElement | null) => {
      if (el) els.current.set(key, el);
      else els.current.delete(key);
    },
    [],
  );
  const focus = useCallback((key: string) => {
    want.current = key;
    rerender((n) => n + 1);
  }, []);
  return { ref, focus };
}

/** Where focus goes when the item at `at` of `ids` leaves: the next item, else the one before,
 *  else `fallback` (the list's add control). */
export function nextFocus(ids: string[], at: number, fallback: string): string {
  return ids[at + 1] ?? ids[at - 1] ?? fallback;
}
