// "A new version is ready": when a late-loading chunk (a route view, a panel, supabase-js) fails to
// load, the tab is older than the deploy. The shell shows one calm notice with Reload
// (StaleBuildNotice) instead of a crash; the reload is noted (chunkError.ts) so the crash reporter
// only hears about it when the reload didn't fix it.
import { useSyncExternalStore } from 'react';
import { isChunkLoadError, markStaleReload } from './chunkError';

export const STALE_MSG = 'A new version is ready. Reload to continue.';

let stale = false;
const listeners = new Set<() => void>();

/** A chunk failed to load: show the notice (once; later failures change nothing). */
export function markStale(): void {
  if (stale) return;
  stale = true;
  listeners.forEach((l) => l());
}

/** True once a chunk has failed to load on this page. */
export function useStaleBuild(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    () => stale,
    () => stale,
  );
}

/** Reload onto the new version (noted first, so a failure after it is reported). */
export function reloadForNewVersion(reload: () => void = () => window.location.reload()): void {
  markStaleReload();
  reload();
}

/** A dynamic import that raises the notice when its chunk is gone. It still rejects, so a caller's
 *  own retry or message keeps working. */
export function importFresh<T>(load: () => Promise<T>): () => Promise<T> {
  return () =>
    load().catch((e: unknown) => {
      if (isChunkLoadError(e)) markStale();
      throw e;
    });
}

/** Vite's preload of a chunk's CSS or dependencies failed (it then rejects the import too). */
export function installStaleBuildGuard(): void {
  window.addEventListener('vite:preloadError', () => markStale());
}

/** Tests start with no notice. */
export function resetStaleBuild(): void {
  stale = false;
}
