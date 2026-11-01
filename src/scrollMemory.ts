// Scroll memory (return paths, Adrian 2026-10-22): each page's scroll position, by its hash, so
// coming back to it (browser Back or Forward, an in-app Back, a top tab reopening where it was)
// lands where it was left. The browser's own restoration is turned off: it restores before the
// page has re-rendered and clamps to the height of the page just left, so the row you opened ends
// up off screen. Here the position comes back once the page is tall enough to hold it, or as far as
// it goes once the page has stopped growing (a row left the list: the page came back shorter), and
// any touch, wheel or key press while waiting leaves the page where it is.
// Kept in sessionStorage, so a reload lands where it was too.
import {
  buildHash,
  getRoute,
  parseHash,
  subscribeRoute,
  subscribeScrollRestore,
  wasReloaded,
} from './route';

const STORE_KEY = 'rjb_scroll';
const MAX_PAGES = 60;
/** How long a restore waits for the page to grow tall enough, at most. */
const WAIT_MS = 2500;
/** A page shorter than the position that has held its height this long has stopped growing (a row
 *  left the list): the restore goes as far as it can now instead of waiting out WAIT_MS. */
const STILL_MS = 150;
/** How long a restore asked for before its navigation waits for the hash to change. */
const HASH_GRACE_MS = 500;
/** Once reached, the position is held until the page has been still this long (rows that load
 *  above it would otherwise push it down, rows that reorder would drag it along through the
 *  browser's scroll anchoring), or the wait runs out. */
const SETTLE_MS = 400;

const norm = (hash: string) => buildHash(parseHash(hash));

let positions = new Map<string, number>();
let pending: {
  hash: string;
  y: number;
  asked: number;
  reveal?: string;
  /** The page height last seen, and when it last changed (before the position is reached: is it
   *  still growing?). */
  height?: number;
  changed?: number;
  /** The position has been reached (or gone as far as the page allows): now it is held. */
  holding?: boolean;
} | null = null;
let installed = false;
/** The page the route has announced (route.ts emits once a hash change has been handled). The
 *  browser's Back changes the URL a moment before that (popstate, then hashchange): a scroll event
 *  dispatched in between is the page being left (a job page's scroll to its top, queued just
 *  before the Back), and must not be saved as the position of the page coming back. */
let shown = '';
let saveTimer: ReturnType<typeof setTimeout> | undefined;

const raf = (f: () => void) =>
  typeof window.requestAnimationFrame === 'function'
    ? window.requestAnimationFrame(f)
    : window.setTimeout(f, 16);

function load(): Map<string, number> {
  try {
    const raw = JSON.parse(sessionStorage.getItem(STORE_KEY) || '[]');
    return new Map(Array.isArray(raw) ? (raw as [string, number][]) : []);
  } catch {
    return new Map();
  }
}

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const entries = [...positions.entries()].slice(-MAX_PAGES);
      sessionStorage.setItem(STORE_KEY, JSON.stringify(entries));
    } catch {
      /* storage full or blocked: memory still works for this page load */
    }
  }, 300);
}

function onScroll() {
  const key = norm(window.location.hash);
  if (key !== shown) return;
  // A restore in progress here: its steps are not the user's position. (One still waiting for its
  // navigation is about another page.)
  if (pending?.hash === key) return;
  positions.delete(key); // newest last, so the cap drops the oldest
  positions.set(key, window.scrollY);
  save();
}

/** A restore is under way for the page showing now (pages skip their scroll-to-top then). */
export function isRestoring(): boolean {
  return !!pending && pending.hash === norm(window.location.hash);
}

/** Scroll a freshly opened page to its top, unless it is coming back to where it was. */
export function scrollToTop(): void {
  if (!isRestoring()) window.scrollTo?.({ top: 0 });
}

function restore(hash: string) {
  const key = norm(hash);
  // A reveal asked for this page wins over its old position.
  if (pending?.reveal && pending.hash === key) return;
  pending = { hash: key, y: positions.get(key) ?? 0, asked: Date.now() };
  raf(step);
}

/** Bring `selector` into view once the page at `hash` shows it (the rail's Change filters lands
 *  on the Pipeline with its Jobs panel in view), instead of the page's old position. */
export function requestReveal(hash: string, selector: string): void {
  pending = { hash: norm(hash), y: 0, asked: Date.now(), reveal: selector };
  raf(step);
}

function step() {
  const p = pending;
  if (!p) return;
  const now = Date.now();
  if (norm(window.location.hash) !== p.hash) {
    // Asked just before its navigation: wait a moment for the hash, then give up.
    if (now - p.asked > HASH_GRACE_MS) pending = null;
    else raf(step);
    return;
  }
  if (p.reveal) {
    const el = document.querySelector(p.reveal);
    if (el || now - p.asked > WAIT_MS) {
      el?.scrollIntoView?.({ block: 'start' });
      pending = null;
    } else raf(step);
    return;
  }
  const height = document.documentElement.scrollHeight;
  const max = Math.max(0, height - window.innerHeight);
  const to = Math.min(p.y, max);
  if (height !== p.height) {
    p.height = height;
    p.changed = now;
  }
  if (!p.holding) {
    // Tall enough, or no longer growing (it came back shorter), or waited long enough: go.
    const still = now - (p.changed ?? now) > STILL_MS;
    if (max >= p.y - 1 || still || now - p.asked > WAIT_MS) {
      window.scrollTo(0, to);
      p.holding = true;
      p.changed = now;
    }
    raf(step);
    return;
  }
  // Holding: the page grew or shrank (rows loading), or the browser moved the scroll to keep what
  // was on screen in place (scroll anchoring, rows above loading or reordering): put the position
  // back, and hold on until the page has been still for a moment.
  if (Math.abs(window.scrollY - to) > 1) {
    window.scrollTo(0, to);
    p.changed = now;
  }
  if (now - (p.changed ?? now) > SETTLE_MS || now - p.asked > 2 * WAIT_MS) pending = null;
  else raf(step);
}

/** The user moved first: leave the page where they put it. */
function cancel() {
  pending = null;
}

/** Turn it on, once (main.tsx). */
export function installScrollMemory(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  try {
    window.history.scrollRestoration = 'manual';
  } catch {
    /* not supported: the browser's own restoration stays */
  }
  positions = load();
  window.addEventListener('scroll', onScroll, { passive: true });
  for (const ev of ['wheel', 'touchstart', 'keydown', 'pointerdown'])
    window.addEventListener(ev, cancel, { passive: true, capture: true });
  subscribeScrollRestore(restore);
  // A new top-level page opens at its top (Companies from the Pipeline's end, a Company page from
  // a scrolled job, Documents from the menu); a page coming back restores instead.
  shown = norm(window.location.hash);
  let last = getRoute();
  subscribeRoute(() => {
    shown = norm(window.location.hash);
    const r = getRoute();
    if (r.tab !== last.tab && !isRestoring()) window.scrollTo(0, 0);
    last = r;
  });
  if (wasReloaded()) restore(window.location.hash);
}
