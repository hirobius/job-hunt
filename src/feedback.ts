// Visible feedback for every action (#212): an action changes state with motion, raises a toast
// (saveNotice / useToast), or highlights the item it made and scrolls it into view. The motion is
// base.css's `[data-motion="flash"]` / `[data-motion="collapse"]` on HDS motion
// tokens; reduced motion keeps the state change and the toast and drops the movement (a flash holds
// still, a collapse is skipped). Flash and collapse mark an attribute, not a class: React owns the
// className of what it renders and rewrites it on any change (a starred table row floats to the top
// and its cells' divider class changes), which would wipe a class mid-flash.
import { useCallback, useState } from 'react';
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

/** The row an action sits in: a table row (an HDS Table's is a `role="row"` div), a list item or
 *  a card. */
export const rowOf = (from: Element | null) =>
  from?.closest('tr, [role="row"], li, article') ?? null;

/** The attribute that carries a flash or a collapse (base.css). */
const MOTION = 'data-motion';
/** Each flashing element's clear-up, so a second flash restarts the length, not just the motion. */
const timers = new WeakMap<Element, ReturnType<typeof setTimeout>>();

/** The boxes that show an element's motion: the element itself, or, for one with no box of its own
 *  (`display: contents`, like an HDS Table row, whose cells are the grid's items), its children. */
function boxesOf(el: Element): Element[] {
  return getComputedStyle(el).display === 'contents' ? [...el.children] : [el];
}

/** Flash an element (a row whose state just changed); a second flash restarts it. */
export function flash(el: Element | null) {
  if (!el) return;
  const boxes = boxesOf(el);
  for (const box of boxes) box.removeAttribute(MOTION);
  void (boxes[0] as HTMLElement | undefined)?.offsetWidth; // restart the animation
  for (const box of boxes) {
    box.setAttribute(MOTION, 'flash');
    clearTimeout(timers.get(box));
    timers.set(
      box,
      setTimeout(() => {
        if (box.getAttribute(MOTION) === 'flash') box.removeAttribute(MOTION);
      }, FLASH_MS),
    );
  }
}

/** Flash the row an action sits in. */
export const flashRow = (from: Element | null) => flash(rowOf(from));

/** Collapse the row an action sits in, then run it (Remove). Under reduced motion, or with no row,
 *  it runs at once. */
export function collapseRow(from: Element | null, then: () => void) {
  const row = rowOf(from);
  if (!row || !motionOk()) return then();
  for (const box of boxesOf(row)) box.setAttribute(MOTION, 'collapse');
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

/** True while a state this view shows has just turned on (v1.5 motion, #279): a posting just
 *  saved, a job just marked applied. False for a state that was already on when the view opened,
 *  and again when `key` moves to another item (Apply mode's pager), so only the action itself
 *  arrives with motion. The caller puts `.rjb-arrive` (base.css) on what appeared. */
export function useArrived(on: boolean, key = ''): boolean {
  const [seen, setSeen] = useState({ key, on, arrived: false });
  // Adjusting state while rendering (React's pattern for a value that follows a prop).
  if (seen.key !== key) setSeen({ key, on, arrived: false });
  else if (seen.on !== on) setSeen({ key, on, arrived: on });
  return seen.arrived;
}
