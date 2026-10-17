// Recently removed: removing a job moves it here instead of deleting it. Each entry keeps the
// whole job (to-dos, notes, interviews) for 30 days, then drops on the next read. Persisted in
// `rjb_trash` and synced in the blob (v6), like every store the user edits (ADR 0008).
// Storage and the cloud are untrusted: everything goes through sanitizeTrash.
import { createStore } from './createStore';
import { mergeByKey } from './mergeByKey';
import { loadPersisted, savePersisted } from './persisted';
import { addJob, dedupKey, getAllJobs, removeJob, replaceAll, sanitizeJobs } from './store';
import type { Job } from './types';

export const TRASH_KEY = 'rjb_trash';
export const TRASH_DAYS = 30;
const DAY = 86_400_000;

export interface Removed {
  job: Job;
  /** ISO time it was removed. */
  removedAt: string;
}

/** Well-formed entries removed in the last 30 days, newest first, one per job. */
export function sanitizeTrash(raw: unknown, now: Date = new Date()): Removed[] {
  if (!Array.isArray(raw)) return [];
  const cutoff = now.getTime() - TRASH_DAYS * DAY;
  const ok: Removed[] = [];
  for (const it of raw) {
    if (!it || typeof it !== 'object') continue;
    const { job, removedAt } = it as { job?: unknown; removedAt?: unknown };
    const t = typeof removedAt === 'string' ? Date.parse(removedAt) : NaN;
    const [clean] = sanitizeJobs([job]);
    if (!clean || Number.isNaN(t) || t < cutoff) continue;
    ok.push({ job: clean, removedAt: removedAt as string });
  }
  const seen = new Set<string>();
  return ok
    .sort((a, b) => Date.parse(b.removedAt) - Date.parse(a.removedAt))
    .filter((r) => {
      const k = dedupKey(r.job.url);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

const store = createStore<Removed[]>(sanitizeTrash(loadPersisted<unknown>(TRASH_KEY, [])), {
  onSet: (next) => savePersisted(TRASH_KEY, next),
});

export const useTrash = store.use;
export const getTrash = store.get;
export const replaceTrash = (next: Removed[]) => store.set(sanitizeTrash(next));

/** First sign-in: both sides kept, cloud wins a shared job. */
export const mergeTrash = (cloud: Removed[] | null, local: Removed[]): Removed[] =>
  sanitizeTrash(mergeByKey((r) => dedupKey(r.job.url), cloud, local));

// The job just removed on this device, for the Undo toast. In memory only.
const last = createStore<string | null>(null);
export const useLastRemoved = last.use;
export const getLastRemoved = last.get;
export const clearLastRemoved = () => last.set(null);

/** Remove a job: out of the list, into the trash. */
export function trashJob(url: string) {
  const job = getAllJobs().find((j) => j.url === url);
  if (!job) return;
  removeJob(url);
  const key = dedupKey(url);
  replaceTrash([
    { job, removedAt: new Date().toISOString() },
    ...getTrash().filter((r) => dedupKey(r.job.url) !== key),
  ]);
  last.set(url);
}

/** Put a removed job back. If it was saved again since, the saved one stays. */
export function restoreJob(url: string) {
  const key = dedupKey(url);
  const entry = getTrash().find((r) => dedupKey(r.job.url) === key);
  if (!entry) return;
  if (addJob(entry.job.url)) {
    // addJob made a bare job: swap in the removed one, keeping its place at the end.
    replaceAll(getAllJobs().map((j) => (dedupKey(j.url) === key ? entry.job : j)));
  }
  purgeJob(url);
}

/** Delete a removed job for good. */
export function purgeJob(url: string) {
  const key = dedupKey(url);
  replaceTrash(getTrash().filter((r) => dedupKey(r.job.url) !== key));
  if (getLastRemoved() && dedupKey(getLastRemoved()!) === key) clearLastRemoved();
}
