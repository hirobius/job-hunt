// Recently removed: removing a job moves it here instead of deleting it. Each entry keeps the
// whole job (to-dos, notes, interviews) for 30 days, then drops on the next read. Persisted in
// `rjb_trash` and synced in the blob (v8), like every store the user edits (ADR 0008).
// Storage and the cloud are untrusted: everything goes through sanitizeTrash.
import { createStore } from './createStore';
import { mergeByKey } from './mergeByKey';
import { loadPersisted, savePersisted } from './persisted';
import { addJob, dedupKey, getAllJobs, removeJob, replaceAll, sanitizeJobs } from './store';
import { dropDocumentsForJob, getAllDocuments, restoreDocument } from './documents';
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

const notesOf = (j: Job) => (j.notes ?? j.note ?? '').trim();
const isBlank = (v: unknown) =>
  v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
// Merged on their own below, or the saved copy's to keep (set aside stays as the user left it).
const OWN: ReadonlySet<string> = new Set([
  'url',
  'label',
  'status',
  'applied',
  'followUp',
  'snoozeUntil',
  'archived',
  'history',
  'note',
  'notes',
  'todos',
  'events',
  'decks',
]);

/** The removed copy folded into the copy saved since. The saved copy's own fields win; a field
 *  only the removed copy holds (contact, pay, screening…) comes across, and a copy saved again
 *  that is still Saved takes the removed copy's further status with its dates. Notes, to-dos,
 *  interviews, decks and status history are joined. Nothing either copy holds is dropped. */
function mergeRemovedInto(saved: Job, removed: Job): Job {
  const a = notesOf(saved);
  const b = notesOf(removed);
  const notes = !b || a === b ? a : !a ? b : `${a}\n\n--- From the removed copy ---\n\n${b}`;
  const byId = <T extends { id: string }>(keep: T[] = [], add: T[] = []) => {
    const ids = new Set(keep.map((x) => x.id));
    return [...keep, ...add.filter((x) => !ids.has(x.id))];
  };
  const todos = byId(saved.todos, removed.todos);
  const events = byId(saved.events, removed.events);
  const decks = byId(saved.decks, removed.decks);
  const seen = new Set((saved.history ?? []).map((h) => `${h.status}|${h.at}`));
  const history = [
    ...(saved.history ?? []),
    ...(removed.history ?? []).filter((h) => !seen.has(`${h.status}|${h.at}`)),
  ].sort((x, y) => x.at.localeCompare(y.at));
  const filled: Partial<Job> = {};
  for (const [k, v] of Object.entries(removed)) {
    if (OWN.has(k) || isBlank(v) || !isBlank(saved[k as keyof Job])) continue;
    (filled as Record<string, unknown>)[k] = v;
  }
  const behind = saved.status === 'Saved' && removed.status !== 'Saved';
  return {
    ...saved,
    ...filled,
    ...(behind
      ? {
          status: removed.status,
          ...(removed.applied ? { applied: removed.applied } : {}),
          ...(removed.followUp ? { followUp: removed.followUp } : {}),
          ...(removed.snoozeUntil ? { snoozeUntil: removed.snoozeUntil } : {}),
        }
      : {}),
    ...(notes ? { notes } : {}),
    ...(todos.length ? { todos } : {}),
    ...(events.length ? { events } : {}),
    ...(decks.length ? { decks } : {}),
    ...(history.length ? { history } : {}),
  };
}

/** Remove a job: out of the list, into the trash. A posting removed before keeps that copy's
 *  notes, to-dos and the rest, folded into this one (one entry per job). */
export function trashJob(url: string) {
  const job = getAllJobs().find((j) => j.url === url);
  if (!job) return;
  removeJob(url);
  const key = dedupKey(url);
  const earlier = getTrash().find((r) => dedupKey(r.job.url) === key);
  replaceTrash([
    {
      job: earlier ? mergeRemovedInto(job, earlier.job) : job,
      removedAt: new Date().toISOString(),
    },
    ...getTrash().filter((r) => dedupKey(r.job.url) !== key),
  ]);
}

/** Put a removed job back. If the posting was saved again since, the removed copy's notes,
 *  to-dos and interviews are merged into the saved one ('merged'); either way nothing is lost. */
export function restoreJob(url: string): 'restored' | 'merged' | 'missing' {
  const key = dedupKey(url);
  const entry = getTrash().find((r) => dedupKey(r.job.url) === key);
  if (!entry) return 'missing';
  let outcome: 'restored' | 'merged' = 'restored';
  if (addJob(entry.job.url)) {
    // addJob made a bare job: swap in the removed one, keeping its place at the end.
    replaceAll(getAllJobs().map((j) => (dedupKey(j.url) === key ? entry.job : j)));
  } else {
    outcome = 'merged';
    replaceAll(
      getAllJobs().map((j) => (dedupKey(j.url) === key ? mergeRemovedInto(j, entry.job) : j)),
    );
  }
  purgeJob(url);
  return outcome;
}

/** Delete a removed job for good. */
export function purgeJob(url: string) {
  const key = dedupKey(url);
  replaceTrash(getTrash().filter((r) => dedupKey(r.job.url) !== key));
}

/** Delete forever (the Recently removed button): the job and its Documents are gone. Purging
 *  after a restore goes through purgeJob and keeps them. If the posting was saved again since,
 *  its Documents belong to the saved job and stay. Documents of a job that ages out of the
 *  trash stay as harmless orphans (no sweep, like per-track data). Returns the Undo (#212): the
 *  entry and its Documents back in their places. */
export function deleteForever(url: string): () => void {
  const key = dedupKey(url);
  const entry = getTrash().find((r) => dedupKey(r.job.url) === key);
  const docs = getAllDocuments()
    .map((d, at) => ({ d, at }))
    .filter(({ d }) => d.jobUrl && dedupKey(d.jobUrl) === key);
  purgeJob(url);
  const saved = getAllJobs().some((j) => dedupKey(j.url) === key);
  if (!saved) dropDocumentsForJob(url);
  return () => {
    if (entry && !getTrash().some((r) => dedupKey(r.job.url) === key))
      replaceTrash([...getTrash(), entry]);
    if (!saved) for (const { d, at } of docs) restoreDocument(d, at);
  };
}
