// Scroll memory (return paths, Adrian 2026-10-22): each page's scroll position, by its hash, so
// coming back to it (browser Back or Forward, an in-app Back, a top tab reopening where it was)
// lands where it was left. The browser's own restoration is turned off: it restores before the
// page has re-rendered and clamps to the height of the page just left, so the row you opened ends
// up off screen. Here the position comes back once the page is tall enough to hold it (or after
// a short wait), and any touch, wheel or key press while waiting leaves the page where it is.
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
/** How long a restore waits for the page to grow tall enough. */
const WAIT_MS = 2500;
/** How long a restore asked for before its navigation waits for the hash to change. */
const HASH_GRACE_MS = 500;

const norm = (hash: string) => buildHash(parseHash(hash));

let positions = new Map<string, number>();
let pending: { hash: string; y: number; asked: number; reveal?: string } | null = null;
let installed = false;
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
  if (pending) return; // a restore in progress: its steps are not the user's position
  const key = norm(window.location.hash);
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
  const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  if (max >= p.y - 1 || now - p.asked > WAIT_MS) {
    window.scrollTo(0, Math.min(p.y, max));
    pending = null;
    return;
  }
  raf(step);
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
  for (const ev of ['wheel', 'touchstart', 'keydown'])
    window.addEventListener(ev, cancel, { passive: true, capture: true });
  subscribeScrollRestore(restore);
  // A new top-level page opens at its top (Companies from the Pipeline's end, a Company page from
  // a scrolled job, Documents from the menu); a page coming back restores instead.
  let last = getRoute();
  subscribeRoute(() => {
    const r = getRoute();
    if (r.tab !== last.tab && !isRestoring()) window.scrollTo(0, 0);
    last = r;
  });
  if (wasReloaded()) restore(window.location.hash);
}
