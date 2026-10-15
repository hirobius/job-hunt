// Track writes that haven't reached the cloud yet (#168 review). curationStore's mirror records
// each row write here before sending it and clears it once the cloud accepts it. A refused write
// stays, marked `failed`, and the next sync (Retry sync, focus, sign-in) replays it: a pending
// upsert's local row wins over the cloud copy, and a pending delete is re-sent instead of the
// cloud row coming back. Persisted, so a reload doesn't forget it; an `rjb_` key, so sign-out
// (which asks first while anything is pending) clears it with the rest of this browser's data.
import { createStore } from '../createStore';
import { loadPersisted, savePersisted } from '../persisted';

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
const store = createStore<Record<string, PendingWrite>>(loadPersisted(KEY, {}), {
  onSet: (next) => savePersisted(KEY, next),
});

const keyOf = (table: PendingTable, id: string) => `${table}:${id}`;

/** Record a write about to be sent. Returns its version, for `settlePending`. */
export function markPending(table: PendingTable, id: string, op: PendingOp): number {
  const all = store.get();
  const v = (all[keyOf(table, id)]?.v ?? 0) + 1;
  store.set({ ...all, [keyOf(table, id)]: { table, id, op, v, failed: false } });
  return v;
}

/** The write with version `v` finished: cleared on success, kept and marked failed otherwise. */
export function settlePending(table: PendingTable, id: string, v: number, ok: boolean) {
  const all = store.get();
  const cur = all[keyOf(table, id)];
  if (!cur || cur.v !== v) return; // a newer write to the row owns the entry now
  if (ok) {
    const rest = { ...all };
    delete rest[keyOf(table, id)];
    store.set(rest);
  } else store.set({ ...all, [keyOf(table, id)]: { ...cur, failed: true } });
}

export function getPending(): PendingWrite[] {
  return Object.values(store.get());
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
  store.set({});
}
