// Lightweight hash-based routing — no react-router. The URL hash mirrors the app's
// navigable state so refresh and back/forward restore it:
//
//   #/<tab>[/<sub>][?pillar=<id>]      #/queue/<jobId>
//   #/queue · #/queue/k3x9a1 · #/discover/titles · #/discover/ats?pillar=abc123
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
  /** The job a `#/queue/<jobId>` route opens (store.jobIdOf), or null. Its own field — the second
   *  segment means a job under `queue` and a sub-tab everywhere else (#127). */
  jobId: string | null;
}

/** The tab whose second segment is a job id: #/queue/<jobId>. */
const JOB_TAB = 'queue';

/** Parse a raw `location.hash` string into a Route. Pure — exported for tests. */
export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#\/?/, '');
  const [path, query] = raw.split('?');
  const seg = path.split('/').filter(Boolean);
  const qp = new URLSearchParams(query || '');
  const tab = seg[0] || '';
  const second = seg[1] || null;
  const isJob = tab === JOB_TAB && second !== null;
  return {
    tab,
    sub: isJob ? null : second,
    pillar: qp.get('pillar'),
    jobId: isJob ? second : null,
  };
}

/** Serialize a Route back into a `#/...` hash string. Pure — exported for tests. */
export function buildHash(r: Route): string {
  const second = r.tab === JOB_TAB ? r.jobId : r.sub;
  const path = [r.tab, second].filter(Boolean).join('/');
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
  const cur = getSnapshot();
  const next = { ...cur, ...patch };
  // A job id belongs to the tab it was opened in: switching tabs without naming a job drops it.
  if (patch.tab !== undefined && patch.tab !== cur.tab && !('jobId' in patch)) next.jobId = null;
  const h = buildHash(next);
  if (h === window.location.hash) return;
  if (replace) {
    window.history.replaceState(null, '', window.location.pathname + window.location.search + h);
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

/** The hash of a saved job's page (#/queue/<jobId>), for links. */
export function jobHash(jobId: string): string {
  return buildHash({ tab: JOB_TAB, sub: null, pillar: null, jobId });
}

/** Open a saved job's page, or (null) go back to the Pipeline list. */
export function openJob(jobId: string | null, replace = false): void {
  navigate({ tab: JOB_TAB, jobId }, replace);
}

/** Open Apply mode on a saved job (#/apply/<jobId>, rapid apply). */
export function openApply(jobId: string): void {
  navigate({ tab: 'apply', sub: jobId, jobId: null });
}

/** The tab whose second segment is a Company slug: #/company/<slug> (#230). */
export const COMPANY_TAB = 'company';

/** The hash of a Company's page, for links (its slug is URL-safe, but escaped all the same). */
export function companyHash(slug: string): string {
  return buildHash({ tab: COMPANY_TAB, sub: encodeURIComponent(slug), pillar: null, jobId: null });
}

/** Open a Company's page (#/company/<slug>). */
export function openCompany(slug: string): void {
  navigate({ tab: COMPANY_TAB, sub: encodeURIComponent(slug), jobId: null });
}
