// The account this tab vouches for (#288). Every tab shares this browser's stores (`rjb_*`) and
// its Supabase session, but each holds its own copy of the data in memory. When another tab signs
// out, or signs in as someone else, this tab's copy still belongs to the old account: syncing it
// would send it to whoever the shared session now names. So this tab freezes instead: no pull, no
// push, no track write, no `rjb_` write to shared storage, until a reload starts it again from
// what the other tab left (the notice says so). Following the new account in place is not safe:
// its sync base is already on this device, so the merge guard would not ask and this tab's old
// account's data would be merged into it.

/** Why this tab stopped: the session now names another account, or none. */
export type FrozenReason = 'switched' | 'signedOut';

let owner: string | null = null;
let frozen: FrozenReason | null = null;
const listeners = new Set<(why: FrozenReason) => void>();
let restoreStorage: (() => void) | null = null;

/** Set by CloudSync once a user has passed the whole sign-in path in this tab (email check, then
 *  the merge guard); null on this tab's own sign-out. Nothing is written for anyone else. */
export function setTabAccount(uid: string | null): void {
  owner = uid;
}
export const tabAccount = (): string | null => owner;
export const tabFrozen = (): FrozenReason | null => frozen;

/** May this tab send a write that the stored session `uid` would carry? Only for its own account,
 *  and never once frozen. */
export const mayWriteAs = (uid: string | null): boolean =>
  frozen === null && uid !== null && uid === owner;

/** The user id in a stored Supabase session (`sb-…-auth-token`), or null for none / unreadable. */
export function storedSessionUser(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as { user?: { id?: unknown } } | null;
    return typeof s?.user?.id === 'string' ? s.user.id : null;
  } catch {
    return null;
  }
}
export const isAuthKey = (key: string | null): boolean => /^sb-.+-auth-token$/.test(key ?? '');

/** Does the session another tab stored (or removed) leave this tab's account behind? A token
 *  refresh for the same user does not. Null when this tab holds no account (it follows a sign-in
 *  through the whole path instead). */
export function sessionChange(newValue: string | null): FrozenReason | null {
  if (owner === null) return null;
  const uid = storedSessionUser(newValue);
  if (uid === owner) return null;
  return uid === null ? 'signedOut' : 'switched';
}

// The device-wide preference survives, as on sign-out (clearLocalData).
const guarded = (key: string) => key.startsWith('rjb_') && key !== 'rjb_color_mode';

/** Stop this tab for good (until reload). A sign-out elsewhere still lets this tab keep its edits
 *  in shared storage: that sign-out wiped the sync base, so the next sign-in (any account) asks
 *  before taking them (the merge guard, #169). A sign-in elsewhere after that has passed the guard
 *  already, so from then on this tab's edits stay in this tab (`sessionWhileFrozen`). */
export function freezeTab(why: FrozenReason): void {
  if (frozen === why || frozen === 'switched') return;
  frozen = why;
  if (why === 'switched') guardStorage();
  listeners.forEach((l) => l(why));
}

/** A session turned up in another tab while this one is stopped. Someone else's: a switch. This
 *  tab's own account again: that tab has stored the cloud copy and the sync base, and this tab's
 *  copy is older, so written to shared storage it would make the next load read what that tab
 *  pulled as removed here, and remove it from the cloud. Either way this tab's edits now stay here. */
export function sessionWhileFrozen(uid: string): void {
  if (frozen === null) return;
  if (uid !== owner) freezeTab('switched');
  else guardStorage();
}

// Edits made here from now on must not reach shared storage: the other tab (or this one, after
// the reload) would read them as the new account's data and sync them there.
function guardStorage() {
  if (restoreStorage) return;
  try {
    const proto = Storage.prototype;
    const { setItem, removeItem, clear } = proto;
    const local = (s: Storage) => {
      try {
        return s === window.localStorage;
      } catch {
        return false;
      }
    };
    proto.setItem = function (this: Storage, key: string, value: string) {
      if (local(this) && guarded(String(key))) return;
      setItem.call(this, key, value);
    };
    proto.removeItem = function (this: Storage, key: string) {
      if (local(this) && guarded(String(key))) return;
      removeItem.call(this, key);
    };
    proto.clear = function (this: Storage) {
      if (local(this)) return;
      clear.call(this);
    };
    restoreStorage = () => {
      proto.setItem = setItem;
      proto.removeItem = removeItem;
      proto.clear = clear;
    };
  } catch {
    /* no Storage: nothing to guard */
  }
}

/** Hear the freeze (CloudSync shows the notice). Returns an unsubscribe. */
export function onTabFrozen(cb: (why: FrozenReason) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Tests only: a fresh tab (a reload). */
export function resetTabAccount(): void {
  restoreStorage?.();
  restoreStorage = null;
  owner = null;
  frozen = null;
}
