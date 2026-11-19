// The sync engine (#814 step 2): the push / merge loop between this device's stores and the one
// cloud row, with no React. It owns three facts the loop decides on: the row's stamp as this tab
// last saw it (`known`), the JSON last sent or adopted (`lastSynced`, so a store change it caused
// is not pushed back), and whether a pull has merged the cloud in since sign-in (`pulled`: until
// then a push would overwrite cloud-only jobs, #161). Everything else comes in through ports, so
// each path (a conflict, a failed write, a newer blob, a push racing a pull) is testable alone.
import {
  mergeBlob,
  emptyBlob,
  readBlob,
  writeBlob,
  BLOB_VERSION,
  type SyncData,
} from '../syncBlob';
import type { readSyncBase, readSyncHashes } from '../syncBase';
import type { RowStamp, WriteResult } from './trackerRow';

/** How many times a push merges a newer cloud copy in and sends again before it gives up. */
export const PUSH_TRIES = 3;

export interface SyncUser {
  id: string;
}

export interface SyncPorts<U extends SyncUser> {
  /** The cloud row (trackerRow.ts). `readRow` throws when the read fails. */
  readRow(uid: string): Promise<{ blob: SyncData | null; stamp: RowStamp }>;
  writeRow(uid: string, data: unknown, was: RowStamp): Promise<WriteResult>;
  /** This device's synced stores (localSyncData.ts). */
  readLocal(): SyncData;
  localJson(): string;
  applyLocal(next: SyncData): void;
  /** The base the three-way merge compares against (syncBase.ts, #219). */
  readBase(uid: string): {
    keys: ReturnType<typeof readSyncBase>;
    hashes: ReturnType<typeof readSyncHashes>;
  };
  rememberBase(uid: string, d: SyncData): void;
  /** The shared session still names `u` (#288); false stops this send or pull. */
  sessionIsStill(u: U): Promise<boolean>;
  /** `u` passed the sign-in path and no Delete my data is under way (#393). */
  owns(uid: string): boolean;
  /** Another tab took the session, or a newer version wrote the row (tabAccount.ts). */
  frozen(): boolean;
  deleting(): boolean;
  /** The cloud copy was written by a newer app version (#382): stop, never rewrite it. */
  freezeNewerVersion(): void;
  /** After a two-sided merge with a cloud copy: the provider says so if the evidence text, kept
   *  from both sides, passed its cap (evidenceStore.ts). */
  mergedBoth(cloud: SyncData, local: SyncData): void;
}

export type PushResult = 'ok' | 'failed' | 'stopped';

export interface SyncEngine<U extends SyncUser> {
  /** Whether a pull has merged the cloud in since sign-in. */
  readonly pulled: boolean;
  markPulled(): void;
  /** A new sign-in or a sign-out: the next pull must land before any push. */
  reset(): void;
  /** Local stores differ from what was last sent or adopted. */
  dirty(): boolean;
  /** Send local data over the stamp last seen; on a conflict merge the newer copy in and resend.
   *  'stopped': not this account's turn (no pull yet, signed out, another tab, deleting), so the
   *  caller says nothing; 'failed': the cloud did not take it, so local data stays dirty. */
  push(u: U): Promise<PushResult>;
  /** Pull and merge (`both`: a sign-in or a turned-down push). Null when the account changed. */
  mergeIn(u: U, both: boolean): Promise<{ next: SyncData; merged: boolean } | null>;
}

export function createSyncEngine<U extends SyncUser>(ports: SyncPorts<U>): SyncEngine<U> {
  let known: RowStamp | null = null;
  let lastSynced = '';
  let pulled = false;

  const dirty = () => ports.localJson() !== lastSynced;

  async function writeRow(uid: string, data: unknown): Promise<'ok' | 'conflict' | 'fail'> {
    if (!known) return 'fail';
    const { result, stamp } = await ports.writeRow(uid, data, known);
    if (stamp) known = stamp;
    return result;
  }

  async function mergeIn(u: U, both: boolean) {
    let got: { blob: SyncData | null; stamp: RowStamp } | null = null;
    // A push from this tab that lands while the pull is out makes its copy older than the cloud's:
    // adopting it would revert that push here and rewind the stamp, so pull again.
    for (let i = 0; i < PUSH_TRIES && !got; i++) {
      if (!(await ports.sessionIsStill(u))) return null;
      const seen = known;
      const r = await ports.readRow(u.id);
      // Signed out (or another account, here or in another tab) while it pulled, or deleting.
      if (!ports.owns(u.id) || !(await ports.sessionIsStill(u))) return null;
      if (known === seen) got = r;
    }
    if (!got) return null;
    const { blob: cloud, stamp } = got;
    // Written by a newer version (#382): adopting it would drop the fields this one doesn't
    // know, and the next push would rewrite the row without them. Stop instead.
    if (cloud && cloud.sourceV > BLOB_VERSION) {
      ports.freezeNewerVersion();
      return null;
    }
    // Else the cloud copy is the truth, unless an edit landed here while the pull was out: then
    // both sides merge too, so the edit is not replaced (audit 3).
    const merged = both || (pulled && dirty());
    const local = ports.readLocal();
    const base = ports.readBase(u.id);
    const next = mergeBlob(cloud, local, merged, base.keys, base.hashes);
    ports.rememberBase(u.id, cloud ?? emptyBlob());
    known = stamp;
    if (merged && cloud) ports.mergedBoth(cloud, local);
    ports.applyLocal(next);
    // What was just adopted, so the store changes it caused don't echo a push.
    lastSynced = ports.localJson();
    return { next, merged };
  }

  async function push(u: U): Promise<PushResult> {
    if (!pulled || !ports.owns(u.id) || ports.frozen()) return 'stopped';
    let ok = false;
    for (let i = 0; i < PUSH_TRIES && !ok; i++) {
      const sent = ports.localJson();
      const data = writeBlob(ports.readLocal());
      let r: 'ok' | 'conflict' | 'fail';
      try {
        if (!(await ports.sessionIsStill(u)) || ports.deleting()) return 'stopped';
        r = await writeRow(u.id, data);
      } catch {
        r = 'fail';
      }
      if (r === 'ok') {
        ok = true;
        lastSynced = sent;
        ports.rememberBase(u.id, readBlob(data)); // what the cloud now holds (#219)
      } else if (r === 'fail') break;
      else {
        try {
          if (!(await mergeIn(u, true))) return 'stopped';
        } catch {
          break;
        }
      }
    }
    return ok ? 'ok' : 'failed';
  }

  return {
    get pulled() {
      return pulled;
    },
    markPulled: () => {
      pulled = true;
    },
    reset: () => {
      pulled = false;
      known = null;
    },
    dirty,
    push,
    mergeIn,
  };
}
