// Track writes that haven't reached the cloud yet (#168 review). curationStore's mirror records
// each row write here before sending it and clears it once the cloud accepts it. A refused write
// stays, marked `failed`, and the next sync (Retry sync, focus, sign-in) replays it: a pending
// upsert's local row wins over the cloud copy, and a pending delete is re-sent instead of the
// cloud row coming back. Persisted, so a reload doesn't forget it; an `rjb_` key, so sign-out
// (which asks first while anything is pending) clears it with the rest of this browser's data.
import { createStore } from '../createStore';

export type PendingTable = 'categories' | 'groups' | 'tiles';
export type PendingOp = 'upsert' | 'delete';

export interface PendingWrite {
  table: PendingTable;
  id: string;
  op: PendingOp;
  /** Bumped on every write to the row, so an older write's success can't clear a newer one. */
  v: number;
  /** The cloud refused it (or the session was gone): only a sync will send it now. */
  failed: boolean;
}

const KEY = 'rjb_curation_pending';
const TABLES: readonly string[] = ['categories', 'groups', 'tiles'];

/** One stored entry, or null when it isn't a valid PendingWrite. */
function validEntry(key: string, x: unknown): PendingWrite | null {
  if (!x || typeof x !== 'object') return null;
  const e = x as Record<string, unknown>;
  const ok =
    typeof e.table === 'string' &&
    TABLES.includes(e.table) &&
    typeof e.id === 'string' &&
    (e.op === 'upsert' || e.op === 'delete') &&
    typeof e.v === 'number' &&
    typeof e.failed === 'boolean' &&
    key === `${e.table}:${e.id}`;
  return ok ? (e as unknown as PendingWrite) : null;
}

/** Parse the stored journal, keeping only valid entries. A damaged journal never throws: bad
 *  entries are dropped with a warning (and the next write saves the cleaned copy). */
export function parseJournal(raw: string | null): Record<string, PendingWrite> {
  if (raw == null) return {};
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    console.warn('[track sync] Dropped an unreadable pending-writes journal.');
    return {};
  }
  if (data === null) return {};
  if (typeof data !== 'object' || Array.isArray(data)) {
    console.warn('[track sync] Dropped a pending-writes journal of the wrong shape.');
    return {};
  }
  const out: Record<string, PendingWrite> = {};
  let dropped = 0;
  for (const [k, v] of Object.entries(data)) {
    const e = validEntry(k, v);
    if (e) out[k] = e;
    else dropped++;
  }
  if (dropped) console.warn(`[track sync] Dropped ${dropped} invalid pending-write entries.`);
  return out;
}

// Storage is the source of truth, shared by every tab of this browser: each change re-reads it,
// applies one entry and writes it back, so two tabs never overwrite each other's entries. The
// in-memory copy only feeds React, and follows other tabs through the `storage` event. Where
// storage is blocked, the in-memory copy is all there is (it then lasts this page view).
let storageOk = true;
function read(): Record<string, PendingWrite> {
  try {
    const raw = localStorage.getItem(KEY);
    storageOk = true;
    return parseJournal(raw);
  } catch {
    storageOk = false;
    return store.get();
  }
}
function write(next: Record<string, PendingWrite>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    storageOk = false;
  }
  store.set(next);
}

const store = createStore<Record<string, PendingWrite>>({});
store.set(read());
if (typeof window !== 'undefined')
  window.addEventListener('storage', (e) => {
    if (e.key === KEY || e.key === null) store.set(read());
  });

const keyOf = (table: PendingTable, id: string) => `${table}:${id}`;

/** Record a write about to be sent. Returns its version, for `settlePending`. */
export function markPending(table: PendingTable, id: string, op: PendingOp): number {
  const all = read();
  const v = Math.max(all[keyOf(table, id)]?.v ?? 0, store.get()[keyOf(table, id)]?.v ?? 0) + 1;
  write({ ...all, [keyOf(table, id)]: { table, id, op, v, failed: false } });
  return v;
}

/** Record many writes about to be sent, in one storage write. Returns each one's version. */
export function markPendingMany(table: PendingTable, ids: string[], op: PendingOp): number[] {
  const all = read();
  const mem = store.get();
  const next = { ...all };
  const vs = ids.map((id) => {
    const k = keyOf(table, id);
    const v = Math.max(next[k]?.v ?? 0, mem[k]?.v ?? 0) + 1;
    next[k] = { table, id, op, v, failed: false };
    return v;
  });
  write(next);
  return vs;
}

/** The write with version `v` finished: cleared on success, kept and marked failed otherwise. */
export function settlePending(table: PendingTable, id: string, v: number, ok: boolean) {
  settlePendingMany(table, [{ id, v }], ok);
}

/** Settle many writes that shared one outcome (one bulk request), in one storage write. */
export function settlePendingMany(
  table: PendingTable,
  writes: { id: string; v: number }[],
  ok: boolean,
) {
  const all = read();
  const next = { ...all };
  let changed = false;
  for (const { id, v } of writes) {
    const k = keyOf(table, id);
    const cur = next[k];
    // Gone (delivered or cleared, maybe by another tab) or owned by a newer write: nothing to do.
    if (!cur || cur.v !== v) continue;
    if (ok) delete next[k];
    else next[k] = { ...cur, failed: true };
    changed = true;
  }
  if (changed) write(next);
}

export function getPending(): PendingWrite[] {
  const all = read();
  if (storageOk) store.set(all);
  return Object.values(all);
}

/** Drop the entries a sync just delivered (only if no newer write to the row came meanwhile). */
export function clearDelivered(delivered: PendingWrite[]) {
  for (const p of delivered) settlePending(p.table, p.id, p.v, true);
}

/** Pending writes, in flight or failed: what sign-out would lose. */
export function usePendingCount(): number {
  return Object.keys(store.use()).length;
}
/** Writes the cloud refused: what Retry sync is for. */
export function useFailedCount(): number {
  return Object.values(store.use()).filter((p) => p.failed).length;
}

/** Forget every pending write (tests, and a deliberate wipe). */
export function clearAllPending() {
  write({});
}
