// Visible feedback for every action (#212): an action changes state with motion, raises a toast
// (saveNotice / useToast), or highlights the item it made and scrolls it into view. The motion is
// base.css's `.rjb-flash` / `.rjb-collapse` / `.rjb-pop` on HDS motion tokens; reduced motion keeps
// the state change and the toast and drops the movement (a flash holds still, a collapse is skipped).
import { useCallback } from 'react';
import { createStore } from './createStore';

/** Motion is on: the browser can tell, and the user has not asked for less. Without matchMedia
 *  (jsdom) there is no motion, so tests see the state change at once. */
export function motionOk(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** How long a flash holds (its animation fades out within it; reduced motion holds it still). */
const FLASH_MS = 1200;
/** The collapse's length: `--hds-motion-productive-duration` (150ms) plus a frame of slack. */
const COLLAPSE_MS = 180;

/** The row an action sits in: a table row, a list item or a card. */
const rowOf = (from: Element | null) => from?.closest('tr, li, article') ?? null;

/** Flash an element (a row whose state just changed); a second flash restarts it. */
export function flash(el: Element | null) {
  if (!el) return;
  el.classList.remove('rjb-flash');
  void (el as HTMLElement).offsetWidth; // restart the animation
  el.classList.add('rjb-flash');
  setTimeout(() => el.classList.remove('rjb-flash'), FLASH_MS);
}

/** Flash the row an action sits in. */
export const flashRow = (from: Element | null) => flash(rowOf(from));

/** Collapse the row an action sits in, then run it (Remove). Under reduced motion, or with no row,
 *  it runs at once. */
export function collapseRow(from: Element | null, then: () => void) {
  const row = rowOf(from);
  if (!row || !motionOk()) return then();
  row.classList.add('rjb-collapse');
  setTimeout(then, COLLAPSE_MS);
}

// A new item (a duplicate, a pinned document that moved): the action names it here, and the item
// takes the highlight when it renders (useHighlight).
const wanted = createStore<string | null>(null);

/** Ask for the item with this key to be scrolled into view and flashed when it renders. */
export const highlightNew = (key: string) => wanted.set(key);

/** True once for the item the highlight was asked for. */
export function takeHighlight(key: string): boolean {
  if (wanted.get() !== key) return false;
  wanted.set(null);
  return true;
}

/** A ref for an item that may be the one just made: it scrolls into view and flashes. */
export function useHighlight<T extends HTMLElement>(key: string) {
  const asked = wanted.use() === key;
  return useCallback(
    (el: T | null) => {
      if (!el || !asked || !takeHighlight(key)) return;
      el.scrollIntoView?.({ block: 'nearest', behavior: motionOk() ? 'smooth' : 'auto' });
      flash(el);
    },
    [key, asked],
  );
}

/** A star icon's classes: filled when on, and a pop on each toggle once the user has toggled it
 *  (a star already on when the page opens holds still). */
export function starClass(on: boolean, animate = false): string | undefined {
  const cls = [on && 'rjb-icon-filled', animate && (on ? 'rjb-pop' : 'rjb-pop-off')];
  return cls.filter(Boolean).join(' ') || undefined;
}
