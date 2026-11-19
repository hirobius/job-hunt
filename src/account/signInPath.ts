// The sign-in path (#814 step 3): which user this tab syncs for, and what an auth event does. Before
// anything is pulled or pushed for a user, the path checks that a link's session is the account the
// link named, that another tab has not taken the shared session, and, for an account this device
// has not synced with, asks before this device's data is added to it (login injection, security
// audit). CloudSyncProvider runs the side effects; this module holds the state and the decisions,
// so they are tested without React or supabase-js.
import { sameEmail } from './authLink';

type Uid = string;
interface AuthUser {
  id: Uid;
  email?: string | null;
}

/** Why a tab stops following the shared session (tabAccount.ts). */
export type FreezeWhy = 'switched' | 'signedOut';

/** What one auth event asks the provider to do, in the order the path checks. */
export type AuthStep =
  /** This tab is stopped (#288): it follows no one; a sign-in elsewhere is recorded only. */
  | { kind: 'frozen'; uid: Uid | null }
  /** Another tab signed out, or in as someone else: this tab stops. */
  | { kind: 'freeze'; why: FreezeWhy }
  /** A link's session for another account than the link named: never taken up. */
  | { kind: 'otherAccount' }
  /** The user already through the path (a refresh, a repeated SIGNED_IN): nothing new. */
  | { kind: 'same' }
  /** Signed out: the path is reset. */
  | { kind: 'signedOut' }
  /** The merge question for this user is already open. */
  | { kind: 'asking' }
  /** A new sign-in: the provider resets the engine, then calls `admit`. */
  | { kind: 'signIn' };

/** What the tab knows outside the path: whether it is stopped, and the account it belongs to. */
export interface TabState {
  frozen: boolean;
  /** tabAccount(): the account this tab synced for, or null. */
  owner: Uid | null;
}

export interface SignInPath {
  /** The user that passed the whole path. Nothing is pulled or pushed for anyone else. */
  readonly handled: Uid | null;
  /** True while `uid` is the user through the path. */
  owns(uid: Uid): boolean;
  /** One auth event (supabase-js onAuthStateChange). A new sign-in or a sign-out clears `handled`. */
  step(u: AuthUser | null, tab: TabState): AuthStep;
  /** After `signIn`: ask first when this device holds data and the account is new to it. */
  admit(uid: Uid, needsAsk: boolean): 'ask' | 'pass';
  /** The merge question's answer for `uid`. False when the question went stale (another event). */
  answer(uid: Uid): boolean;
  /** Keep this device's data: the question closes and the session is signed out. */
  decline(uid: Uid): boolean;
  /** This tab's own sign-out or Delete my data: no one is through the path. */
  leave(): void;
  /** While a link's session is set: the email it was accepted for (`withLink`). */
  readonly linkEmail: string | null;
  /** Run `set` with the link's email held, so its session is checked against it. */
  withLink<T>(email: string, set: () => Promise<T>): Promise<T>;
}

/** Whether to ask before syncing: no merge base for this account, and not the device's own. */
export const isNewToDevice = (hasBase: boolean, deviceAccount: Uid | null, uid: Uid): boolean =>
  !hasBase && deviceAccount !== uid;

export function createSignInPath(): SignInPath {
  let handled: Uid | null = null;
  let held: Uid | null = null; // the user the merge question is open for
  let linkEmail: string | null = null;

  return {
    get handled() {
      return handled;
    },
    get linkEmail() {
      return linkEmail;
    },
    owns: (uid) => handled === uid,
    step(u, tab) {
      if (tab.frozen) return { kind: 'frozen', uid: u?.id ?? null };
      // Its own changes of account (sign-out, a confirmed link) clear the owner or hold a link.
      if (tab.owner !== null && u?.id !== tab.owner && linkEmail === null)
        return { kind: 'freeze', why: u ? 'switched' : 'signedOut' };
      if (u && linkEmail !== null && !sameEmail(u.email, linkEmail))
        return { kind: 'otherAccount' };
      // supabase-js says SIGNED_IN again for the same session (tab focus, another tab's broadcast,
      // the initial session after an OAuth return): not a new sign-in (2026-11-15).
      if (u && handled === u.id) return { kind: 'same' };
      handled = null;
      if (!u) {
        held = null;
        return { kind: 'signedOut' };
      }
      if (held === u.id) return { kind: 'asking' };
      return { kind: 'signIn' };
    },
    admit(uid, needsAsk) {
      if (needsAsk) {
        held = uid;
        return 'ask';
      }
      held = null;
      handled = uid;
      return 'pass';
    },
    answer(uid) {
      if (held !== uid) return false;
      held = null;
      handled = uid;
      return true;
    },
    decline: (uid) => held === uid,
    leave() {
      handled = null;
    },
    async withLink(email, set) {
      linkEmail = email;
      try {
        return await set();
      } finally {
        linkEmail = null;
      }
    },
  };
}
