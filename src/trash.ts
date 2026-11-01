// Recently removed: removing a job moves it here instead of deleting it. Each entry keeps the
// whole job (to-dos, notes, interviews) for 30 days, then drops (at read time, #307). Persisted in
// `rjb_trash` and synced in the blob (v8), like every store the user edits (ADR 0008).
// Storage and the cloud are untrusted: everything goes through sanitizeTrash.
import { useEffect, useState } from 'react';
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

const expiresAt = (r: Removed) => Date.parse(r.removedAt) + TRASH_DAYS * DAY;

/** Whole days until an entry drops (1 on its last day). */
export const daysLeft = (removedAt: string, now = Date.now()) =>
  Math.max(0, Math.ceil((Date.parse(removedAt) + TRASH_DAYS * DAY - now) / DAY));

// Entries age out at read time (#307), not only when the store loads or is written: a tab left
// open for days would otherwise list (and sync back) jobs past their 30 days. Reads never write;
// the same array comes back until the store changes or the next entry expires.
let memo: { from: Removed[]; out: Removed[]; until: number } | null = null;

/** Recently removed as of now (past 30 days left out). */
export function getTrash(): Removed[] {
  const all = store.get();
  const now = Date.now();
  if (memo && memo.from === all && now < memo.until) return memo.out;
  const kept = all.filter((r) => expiresAt(r) > now);
  const out = kept.length === all.length ? all : kept;
  memo = { from: all, out, until: Math.min(Infinity, ...out.map(expiresAt)) };
  return out;
}

/** Forget what has aged out, so storage and the cloud copy drop it too. */
function expireTrash() {
  const fresh = getTrash();
  if (fresh !== store.get()) store.set(fresh);
}

const MAX_TIMEOUT = 2 ** 31 - 1; // setTimeout's ceiling (~24.8 days)

/** Recently removed in a component: re-renders when an entry ages out, open tab or not. */
export function useTrash(): Removed[] {
  const all = store.use();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const next = Math.min(Infinity, ...all.map(expiresAt));
    if (!Number.isFinite(next)) return;
    const id = setTimeout(
      () => {
        expireTrash();
        setTick((t) => t + 1); // a long wait is split: check again
      },
      Math.min(Math.max(next - Date.now(), 0) + 1, MAX_TIMEOUT),
    );
    return () => clearTimeout(id);
  }, [all, tick]);
  return getTrash();
}
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
  'docLinks',
]);

/** The removed copy folded into the copy saved since. The saved copy's own fields win; a field
 *  only the removed copy holds (contact, pay, screening…) comes across, and a copy saved again
 *  that is still Saved takes the removed copy's further status with its dates. Notes, to-dos,
 *  interviews, decks, document links and status history are joined. Nothing either copy holds is dropped. */
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
  const docLinks = byId(saved.docLinks, removed.docLinks);
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
    ...(docLinks.length ? { docLinks } : {}),
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
