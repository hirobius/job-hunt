// Visible feedback for every action (#212): an action changes state with motion, raises a toast
// (saveNotice / useToast), or highlights the item it made and scrolls it into view. The motion is
// base.css's `[data-motion="flash"]` / `[data-motion="collapse"]` on HDS motion
// tokens; reduced motion keeps the state change and the toast and drops the movement (a flash holds
// still, a collapse is skipped). Flash and collapse mark an attribute, not a class: React owns the
// className of what it renders and rewrites it on any change (a starred table row floats to the top
// and its cells' divider class changes), which would wipe a class mid-flash.
import { useCallback, useState } from 'react';
import { createStore } from './createStore';
import { motionPaused } from './motionPref';

/** Motion is on: the browser can tell, and the user has not asked for less, by the system's
 *  reduced-motion setting or by the Account menu's Pause animations (motionPref.ts). Without
 *  matchMedia (jsdom) there is no motion, so tests see the state change at once. */
export function motionOk(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches &&
    !motionPaused()
  );
}

/** An HDS motion token's length in ms, read from the page's own variables
 *  (`--hds-motion-<name>-duration`, variables.css), so a wait here and the CSS it waits for can
 *  never disagree. 0 where the variable is not set (jsdom): nothing waits. */
export function motionMs(name: 'productive' | 'spatial' | 'exit' | 'expressive'): number {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(`--hds-motion-${name}-duration`)
    .trim();
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return 0;
  return raw.endsWith('ms') ? n : n * 1000;
}
/** How long a flash holds: base.css `rjb-flash` runs three spatial lengths (reduced motion holds
 *  it still for as long). */
const flashMs = () => motionMs('spatial') * 3;
/** The collapse's length: base.css `rjb-collapse` runs one productive length; a fifth more is
 *  the slack of a frame or two. */
const collapseMs = () => motionMs('productive') * 1.2;

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
  // With no token on the page (jsdom) there is no animation to wait for: the mark stays, so a test
  // reads it.
  const hold = flashMs();
  for (const box of boxes) {
    box.setAttribute(MOTION, 'flash');
    clearTimeout(timers.get(box));
    if (!hold) continue;
    timers.set(
      box,
      setTimeout(() => {
        if (box.getAttribute(MOTION) === 'flash') box.removeAttribute(MOTION);
      }, hold),
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
  setTimeout(then, collapseMs());
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
