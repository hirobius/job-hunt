// Lightweight hash-based routing — no react-router. The URL hash mirrors the app's
// navigable state so refresh and back/forward restore it:
//
//   #/<tab>[/<sub>][?pillar=<id>]
//   #/queue · #/discover/titles · #/discover/ats?pillar=abc123
//
// A tiny external store over `hashchange` (mirrors src/store.ts), read via useSyncExternalStore.
// `tab`/`sub` are opaque slugs the app maps to its own views; `pillar` is the active career
// pillar id. Quick-add deep links (?add/?applied/?status) stay in the query string and are
// handled in App.tsx — they are independent of this hash route.
import { useSyncExternalStore } from 'react';

export interface Route {
  /** Top-level tab slug (e.g. 'queue', 'discover'); '' when the hash carries no route. */
  tab: string;
  /** Nested sub-tab slug (Discover's inner tabs), or null. */
  sub: string | null;
  /** Active career-pillar id, or null. */
  pillar: string | null;
}

/** Parse a raw `location.hash` string into a Route. Pure — exported for tests. */
export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#\/?/, '');
  const [path, query] = raw.split('?');
  const seg = path.split('/').filter(Boolean);
  const qp = new URLSearchParams(query || '');
  return { tab: seg[0] || '', sub: seg[1] || null, pillar: qp.get('pillar') };
}

/** Serialize a Route back into a `#/...` hash string. Pure — exported for tests. */
export function buildHash(r: Route): string {
  const path = [r.tab, r.sub].filter(Boolean).join('/');
  const qp = new URLSearchParams();
  if (r.pillar) qp.set('pillar', r.pillar);
  const q = qp.toString();
  return '#/' + path + (q ? '?' + q : '');
}

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', emit);
}

// Cache the parsed snapshot so useSyncExternalStore gets a stable reference between changes.
let snapHash = typeof window !== 'undefined' ? window.location.hash : '';
let snap: Route = parseHash(snapHash);

function getSnapshot(): Route {
  const h = window.location.hash;
  if (h !== snapHash) {
    snapHash = h;
    snap = parseHash(h);
  }
  return snap;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Merge a partial route into the current one and write it to the URL hash.
 *  `replace` swaps the history entry (no new back-stack step) instead of pushing. */
export function navigate(patch: Partial<Route>, replace = false): void {
  const next = { ...getSnapshot(), ...patch };
  const h = buildHash(next);
  if (h === window.location.hash) return;
  if (replace) {
    window.history.replaceState(
      null,
      '',
      window.location.pathname + window.location.search + h,
    );
    emit(); // replaceState doesn't fire hashchange
  } else {
    window.location.hash = h; // fires hashchange → emit via listener
  }
}

/** Read the current route, re-rendering on any hash change. */
export function useRoute(): Route {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Non-hook getter for callers outside React. */
export function getRoute(): Route {
  return getSnapshot();
}
