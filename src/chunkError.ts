// A tab left open across a deploy asks for chunk files the new deploy no longer has (assets are
// cached immutable and named by hash; supabase-js and the route views load late). That is not a
// crash: a reload fixes it. This module only recognises it and remembers the reload, so the crash
// reporter can stay quiet unless the reload didn't help. No imports: errorReport.ts reads it.

/** sessionStorage: when this tab last reloaded for a new version (ms since epoch). */
export const STALE_RELOAD_KEY = 'rjb_stale_reload';
/** A chunk failing again this soon after that reload means the reload didn't fix it. */
export const RELOAD_GRACE_MS = 2 * 60 * 1000;

// Chrome / Edge, Firefox, Safari, and Vite's own preload error (CSS or a dependency chunk).
const CHUNK_MESSAGE =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS|Failed to load module script|ChunkLoadError|Loading chunk [\w-]+ failed/i;

/** True when an error is a lazy chunk (or a module it needs) that failed to load. */
export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  const e = error as { name?: unknown; message?: unknown };
  const text =
    typeof error === 'string' ? error : `${String(e.name ?? '')} ${String(e.message ?? '')}`;
  return CHUNK_MESSAGE.test(text);
}

function storage(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

/** Note the reload about to happen (the next load can tell whether it helped). */
export function markStaleReload(now = Date.now()): void {
  try {
    storage()?.setItem(STALE_RELOAD_KEY, String(now));
  } catch {
    /* storage blocked: the reload still happens; a failure after it just isn't reported */
  }
}

/** This tab reloaded for a new version moments ago, so a chunk failing now is a real fault. */
export function staleReloadFailed(now = Date.now()): boolean {
  try {
    const at = Number(storage()?.getItem(STALE_RELOAD_KEY));
    return at > 0 && now - at < RELOAD_GRACE_MS;
  } catch {
    return false;
  }
}
