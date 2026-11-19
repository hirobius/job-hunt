// Cloud sync (#31, #99) as a provider (#115 Phase 1): owns the Supabase session, the debounced
// push, the focus re-pull and sign-out/delete, and exposes them through CloudSyncContext. The UI
// lives elsewhere — the account menu, the one-time sync nudge and the sign-in dialog — and
// failures surface as toasts instead of a banner on every page.
import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useToast } from '@hirobius/design-system';
import type { User } from '@supabase/supabase-js';
import type { OAuthProvider } from './oauthPkce';
import {
  loadedSupabase,
  loadSupabase,
  loadWithClient,
  needsClientAtBoot,
  onSupabaseLoaded,
} from '../supabase';
import { signInErrorMessage } from './signInErrors';
import { useJobs } from '../store';
import { useSnippets } from '../copyDeckStore';
import { useTileTriage } from '../tileTriage';
import { useAllTargets } from '../feed/targets';
import { useAllFilters } from '../feed/savedFilters';
import { useEvidence } from '../radar/evidenceStore';
import { useAllModes } from '../trackModes';
import { useApplyKit } from '../applyKit';
import { useAllSweeps } from '../feed/sweepTitles';
import { useAllMustInclude } from '../feed/mustInclude';
import { useTrash } from '../trash';
import { useAllDreams } from '../feed/dreams';
import { useDocuments } from '../documents';
import { useProfiles } from '../profile';
import { useSources } from '../sources';
import { decided as decidedStore } from '../decided';
import type { SyncData } from '../syncBlob';
import type { SyncEngine } from './syncEngine';
import type * as SyncStackModule from './syncStack';
import { syncOnLogin, foldIntoStore, takeLocalLegacyTiles } from '../curation/sync';
import { getCurationState } from '../curation/curationStore';
import {
  freezeTab,
  liftNewerVersionFreeze,
  isAuthKey,
  onTabFrozen,
  sessionChange,
  setTabAccount,
  sessionWhileFrozen,
  storedSessionUser,
  tabAccount,
  tabFrozen,
} from '../tabAccount';
import {
  getCurationSyncStatus,
  onCurationWriteFailed,
  setCurationSyncStatus,
} from '../curation/syncStatus';
import {
  OFFLINE_MSG,
  OFFLINE_TITLE,
  DELETE_FAILED,
  DELETE_ORDER,
  deleteFailedMsg,
  TRACK_WRITE_FAILED,
  RELOAD_ACTION,
  TAB_FROZEN_MESSAGE,
  TAB_FROZEN_TITLE,
} from '../cloudMessages';
import { getPending, useFailedCount } from '../curation/pending';
import { setScanDetails } from '../feed/scanDetails';
import { EVIDENCE_TRIMMED, evidenceMergeOverflows } from '../radar/evidenceStore';
import { CloudSyncContext, PULL_LIMIT, type CloudSyncApi } from './accountContext';
import { magicLinkRedirect } from './authRedirect';
import { oauthMessages } from './authLinkError';
import { rememberSignInReturn, returnAfterSignIn } from './signInReturn';
import { isChunkLoadError } from '../chunkError';
import { importFresh, STALE_MSG } from '../staleBuild';
import { takeBootAuthCode, takeBootAuthTokens, type AuthTokens } from '../authFragment';
import {
  clearSignInRequest,
  decideAuthLink,
  readSignInRequest,
  rememberSignInRequest,
  sameEmail,
} from './authLink';
import { dropSampleTrack } from '../demo/sampleTrack';
import { dropAutoSetup } from '../autoSetup';
import {
  DeleteDataConfirmDialog,
  LinkConfirmScreen,
  MergeConfirmDialog,
  SignOutConfirmDialog,
} from '../lazyDialogs';
import {
  clearDeviceAccount,
  KEPT_ON_SIGN_OUT,
  readDeviceAccount,
  writeDeviceAccount,
} from './deviceAccount';

// The PKCE crypto and the code exchange load with a Google sign-in (the entry is at its budget).

const loadPkce = importFresh(() => import('./oauthPkce'));

// The sync stack (syncStack.ts, #832) loads beside the Supabase client: a signed-out visit never
// needs it, so the entry chunk carries none of it. The client counts as loaded only once the stack
// is in too (loadWithClient), so every use below, all inside the auth callback or for a user it
// set, runs after it, in the same order as before.
let syncStack: typeof SyncStackModule | null = null;
let syncStackLoad: Promise<typeof SyncStackModule> | null = null;
function loadSyncStack(): Promise<typeof SyncStackModule> {
  syncStackLoad ??= importFresh(() => import('./syncStack'))().then(
    (m) => (syncStack = m),
    (e: unknown) => {
      syncStackLoad = null; // a later sign-in tries again
      throw e;
    },
  );
  return syncStackLoad;
}
loadWithClient(loadSyncStack);
function S(): typeof SyncStackModule {
  if (!syncStack) throw new Error('sync stack used before it loaded');
  return syncStack;
}
const BAD_LINK_MSG = 'That sign-in link could not be used. Send a new one from Account.';

/** What the cloud holds, as the base the next merge compares against (#219, entry hashes). */
function rememberBase(uid: string, d: SyncData) {
  S().writeSyncBase(uid, S().keysOf(d), S().hashesOf(d));
}

// Wipe this device's app data (keeps the color-mode preference and which account it last synced
// with, deviceAccount.ts). Used on sign-out and
// delete so a shared browser can't carry one person's jobs/pillars/résumé to the next.
function clearLocalData() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith('rjb_') && !KEPT_ON_SIGN_OUT.includes(k))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

/** eraseCloud's answer when another tab took the session mid-delete (#288). */
const STOPPED = 'stopped';

export default function CloudSyncProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const jobs = useJobs();
  const snippets = useSnippets();
  const triage = useTileTriage();
  // Subscribed so a change to any of these re-runs the push effect below.
  const targets = useAllTargets();
  const filters = useAllFilters();
  const evidence = useEvidence();
  const modes = useAllModes();
  const kit = useApplyKit();
  const sweeps = useAllSweeps();
  const mustInclude = useAllMustInclude();
  const trash = useTrash();
  const dreams = useAllDreams();
  const documents = useDocuments();
  const profiles = useProfiles();
  const sources = useSources();
  const decided = decidedStore.use();
  const [user, setUser] = useState<User | null>(null);
  // What Review last read belongs to the account it read for: a sign-out or a switch clears it, so
  // the Review tab's count (TopTabCount) never shows the previous account's number.
  const scanOwner = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const id = user?.id ?? null;
    // Signing in from signed out keeps this device's count until the new read lands (Adrian
    // 2026-11-15: the count blanked during sign-in); a sign-out or a switch still clears it.
    if (scanOwner.current && scanOwner.current !== id) setScanDetails(null);
    scanOwner.current = id;
  }, [user?.id]);
  const [msg, setMsg] = useState('Sign in to sync across your devices');
  const [signInOpen, setSignInOpen] = useState(false);
  const [accountTrigger, setAccountTrigger] = useState<HTMLButtonElement | null>(null);
  // True while a pull (adopt) is running: "settled" means none is, and the last one didn't fail.
  const [pulling, setPulling] = useState(false);
  // The user whose first cloud read has finished (landed or failed) in this tab. Until then a
  // signed-in device is not settled, even before that read starts (#478 follow-up: between the
  // session answering and the pull starting, the Jobs tab read as "no jobs").
  // A ref: it is set just before `pulling` turns false, which re-renders the context.
  const pulledFor = useRef<string | null>(null);
  // The newest pull (adopt): only it may end the pulling state (a Try again after a hung read).
  const pullRun = useRef(0);
  // False until Supabase reports the stored session (or its absence), so signed-in users don't
  // see the signed-out nudge flash on load. With no session stored (and no magic link returning)
  // the client isn't loaded at all (supabase.ts): signed out, answered a tick later as before.
  const [authResolved, setAuthResolved] = useState(false);
  // True from sign-in until the seed merge (the union of this device + the cloud, then a push)
  // has landed. While set, Retry and focus re-pulls seed too: a cloud-wins merge would drop
  // this device's local-only jobs after a failed first pull.
  const seedPending = useRef(false);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // The pushes on the wire (a timer's and an adopt's can overlap): Delete my data waits them out,
  // or one could land after the delete and write the row back (#393).
  const pushing = useRef(new Set<Promise<boolean>>());
  // From Delete my data's confirm on: nothing more is pushed or adopted (a pull in flight is
  // dropped), so the erased account is not written back or refilled here (#393).
  const deleting = useRef(false);
  // A sign-in link nobody asked for in this browser, waiting on "Sign in as x@y.com?".
  const [linkAsk, setLinkAsk] = useState<{ email: string; tokens: AuthTokens } | null>(null);
  // An account this device never synced with, while it holds data: "Add this device's N jobs?".
  // Until it is answered nothing is pulled or pushed (adopt waits on it).
  const [mergeAsk, setMergeAsk] = useState<{ user: User; question: string } | null>(null);
  const mergeHeld = useRef<string | null>(null);
  // Sign-out with changes the cloud does not hold yet: the HDS confirm's answer (true = sign out).
  const [signOutAsk, setSignOutAsk] = useState<((yes: boolean) => void) | null>(null);
  const askSignOut = () =>
    new Promise<boolean>((resolve) => setSignOutAsk(() => (yes: boolean) => resolve(yes)));
  const answerSignOut = (yes: boolean) => {
    signOutAsk?.(yes);
    setSignOutAsk(null);
  };
  // Delete my data asks first, in the same way (#793): the HDS confirm's answer (true = delete).
  const [deleteAsk, setDeleteAsk] = useState<((yes: boolean) => void) | null>(null);
  const askDelete = () =>
    new Promise<boolean>((resolve) => setDeleteAsk(() => (yes: boolean) => resolve(yes)));
  const answerDelete = (yes: boolean) => {
    deleteAsk?.(yes);
    setDeleteAsk(null);
  };
  // The user that passed the whole sign-in path (email check, then the merge guard). Nothing is
  // pulled or pushed for anyone else, and only their token refreshes skip that path: an expired
  // crafted link is refreshed by supabase-js (TOKEN_REFRESHED, not SIGNED_IN), security re-check.
  const handled = useRef<string | null>(null);
  // While a link's session is being set: the email it was accepted for. Another account is not
  // taken up at all (acceptLink signs it out), so nothing of it is pulled first.
  const linkEmail = useRef<string | null>(null);

  // The push / merge loop (syncEngine.ts, #814): it holds the row's last-seen stamp, what was last
  // sent or adopted, and whether a pull has landed since sign-in; this provider says when. Made on
  // first use, which is always after the sync stack is in (a user exists only through the auth
  // callback, which runs only once the client and the stack have loaded, #832).
  const engineRef = useRef<SyncEngine<User> | null>(null);
  const engine = (): SyncEngine<User> =>
    (engineRef.current ??= S().createSyncEngine<User>({
      readRow: async (uid) => S().readTrackerRow(await loadSupabase(), uid),
      writeRow: async (uid, data, was) => S().writeTrackerRow(await loadSupabase(), uid, data, was),
      readLocal: () => S().readLocalSyncData(),
      localJson: () => S().localSyncJson(),
      applyLocal: (next) => S().applyLocalSyncData(next),
      readBase: (uid) => ({ keys: S().readSyncBase(uid), hashes: S().readSyncHashes(uid) }),
      rememberBase,
      sessionIsStill: (u) => sessionIsStill(u),
      owns: (uid) => handled.current === uid && !deleting.current,
      frozen: () => !!tabFrozen(),
      deleting: () => deleting.current,
      freezeNewerVersion: () => freezeTab('newerVersion'),
      // toastRef (below) is read only when a merge runs, after this render.
      mergedBoth: (cloud, local) => {
        if (evidenceMergeOverflows(cloud.evidence, local.evidence))
          toastRef.current({ ...EVIDENCE_TRIMMED, tone: 'warning', duration: 10000 });
      },
    }));

  // The stores this device syncs (localSyncData.ts, #814).
  const localBlob = () => S().readLocalSyncData();
  const localJson = () => S().localSyncJson();

  // The shared session still names `u` (#288): another tab may have signed out or in as someone
  // else since. If not, this tab freezes (tabAccount.ts) and nothing more is sent or adopted. A
  // session it can't read (offline, a failed refresh: no session plus an error) says nothing about
  // another tab: that send is skipped and retried later, and the tab keeps going.
  async function sessionIsStill(u: User): Promise<boolean> {
    if (tabFrozen()) return false;
    const supa = await loadSupabase();
    const { data, error } = await supa.auth.getSession();
    const s = data.session;
    if (s?.user?.id === u.id) return !tabFrozen();
    if (error && !s) return false;
    if (tabAccount() === u.id) freezeTab(s ? 'switched' : 'signedOut');
    return false;
  }

  // Returns whether the cloud took it. `lastSynced` moves only on success, so a failed push
  // stays "dirty": the next refresh and sign-out both retry it. When another device saved since
  // this tab's last read, its copy is merged in (three-way, against the base) and sent again.
  function pushNow(u: User): Promise<boolean> {
    const run = pushOnce(u);
    pushing.current.add(run);
    void run.finally(() => pushing.current.delete(run));
    return run;
  }
  async function pushOnce(u: User): Promise<boolean> {
    const r = await engine().push(u);
    if (r === 'stopped') return false;
    if (!tabFrozen()) setMsg(r === 'ok' ? `Synced · ${u.email}` : OFFLINE_MSG); // else the notice stays
    return r === 'ok';
  }
  const dirty = () => engine().dirty();
  const pulled = () => engine().pulled;
  const mergeIn = (u: User, both: boolean) => engine().mergeIn(u, both);

  // mergeIn (syncEngine.ts): pull the cloud copy and merge it into this device's stores; `both`
  // (a sign-in, or a push the cloud turned down) merges both sides. Null when the account changed.
  async function adopt(seed: boolean, u: User) {
    // Not through the sign-in path (the merge question is open), or stopped by another tab (#288).
    if (handled.current !== u.id || tabFrozen() || deleting.current) return;
    setMsg(seed ? 'Syncing…' : 'Refreshing…');
    setPulling(true);
    const run = ++pullRun.current;
    const done = () => {
      if (run !== pullRun.current) return;
      pulledFor.current = u.id;
      setPulling(false);
    };
    // A read that hangs says so after PULL_LIMIT.ms ("couldn't load", Try again); if it lands
    // later it still counts, and the sync line says Synced.
    const timer = setTimeout(() => {
      if (!tabFrozen()) setMsg(OFFLINE_MSG);
      done();
    }, PULL_LIMIT.ms);
    try {
      // Unsent local edits (a failed push) must go up before a pull would replace them.
      if (!seed && pulled() && dirty() && !(await pushNow(u))) return;
      const got = await mergeIn(u, seed);
      if (!got) return;
      const { next, merged } = got;
      engine().markPulled();
      if (seed) seedPending.current = false;
      // Tracks live in their own tables: pull + reconcile + upload what's new here (#99).
      if (!(await sessionIsStill(u))) return;
      let curationOk = await syncOnLogin(u.id);
      // Retired user tiles (v3 cloud blob / this device's old store) fold into "My links" AFTER
      // the pull, so the fold sees the cloud's tracks + URLs; a second pass uploads the new rows.
      const legacy = [...next.legacyUserTiles, ...takeLocalLegacyTiles()];
      if (curationOk && legacy.length && (await sessionIsStill(u))) {
        foldIntoStore(legacy);
        curationOk = await syncOnLogin(u.id);
      }
      // An older cloud copy lacks the newer fields (an old tab rewrote it): re-upload them now.
      if (merged || next.legacyUserTiles.length || next.sourceV < S().BLOB_VERSION)
        await pushNow(u);
      if (tabFrozen()) return; // the notice stays in the menu (#288)
      if (!curationOk) setMsg(OFFLINE_MSG);
      else setMsg(`Synced · ${u.email}`);
    } catch {
      setCurationSyncStatus('error');
      if (!tabFrozen()) setMsg(OFFLINE_MSG);
    } finally {
      clearTimeout(timer);
      done();
    }
  }

  // auth state. Token refreshes / profile updates aren't a new sign-in — don't re-run the
  // seed merge (it would also flip the sync gate mid-onboarding).
  useEffect(() => {
    const signedOut = () => {
      foldIntoStore(takeLocalLegacyTiles()); // signed out: fold this device's old links now
      if (getCurationSyncStatus() === 'syncing') setCurationSyncStatus('idle');
      setMsg('Sign in to sync across your devices');
    };
    let unsubscribe = () => {};
    const offLoaded = onSupabaseLoaded((supa) => {
      void supa.auth.getSession().then(
        () => setAuthResolved(true),
        () => setAuthResolved(true),
      );
      const { data } = supa.auth.onAuthStateChange((event, session) => {
        const u = session?.user ?? null;
        setAuthResolved(true);
        // Until the reload, this tab follows no one (#288); anyone signing in elsewhere after a
        // sign-out there, this tab's own account too, keeps this tab's edits out of shared storage.
        if (tabFrozen()) {
          if (u) sessionWhileFrozen(u.id);
          return;
        }
        // Another tab signed out, or in as someone else (supabase-js relays its sign-in here): this
        // tab's copy is the old account's, so it stops instead of following (tabAccount.ts). Its
        // own changes of account (sign-out, a confirmed link) clear tabAccount or set linkEmail.
        const owner = tabAccount();
        if (owner !== null && u?.id !== owner && linkEmail.current === null) {
          freezeTab(u ? 'switched' : 'signedOut');
          return;
        }
        // A link's session for another account than the link named: never taken up here.
        if (u && linkEmail.current !== null && !sameEmail(u.email, linkEmail.current)) return;
        setUser(u);
        // An event for the user already through the path below is not a new sign-in. supabase-js
        // also says SIGNED_IN again for the same session (tab focus, another tab's broadcast, the
        // initial session after an OAuth return): re-running the path reset `pulledOk`, so a
        // sign-out in that window found nothing "flushed" and warned of lost changes (2026-11-15).
        if (u && handled.current === u.id) return;
        handled.current = null;
        setTabAccount(null); // until the path below has run for this user
        // Opened from the magic link: back to the page the link was asked for on (return paths).
        if (event === 'SIGNED_IN') returnAfterSignIn();
        engine().reset(); // new sign-in or sign-out: the next pull must land before any push
        seedPending.current = !!u; // a sign-in owes a seed merge; sign-out or a user change resets it
        if (!u) {
          mergeHeld.current = null;
          setMergeAsk(null);
          signedOut();
          return;
        }
        if (mergeHeld.current === u.id) return; // already asking (a second event for the same user)
        // The sample's track is sample data: never asked about, never uploaded (#107).
        dropSampleTrack();
        // Neither is the auto profile: the account's own profile (or its v11 move) wins.
        dropAutoSetup();
        // Never fold this device's data into an account it has not synced with without asking:
        // a crafted link could be someone else's account (login injection, security audit).
        // The account this device last synced with is not asked again: sign-out wiped its base, and
        // what is here now was made on this device since (deviceAccount.ts).
        const held =
          S().readSyncBase(u.id) === null && readDeviceAccount() !== u.id
            ? S().deviceData(localBlob(), getCurationState().categories.length)
            : null;
        if (held?.any) {
          mergeHeld.current = u.id;
          setMergeAsk({ user: u, question: S().mergeQuestion(held, u.email ?? 'this account') });
          return;
        }
        mergeHeld.current = null;
        setMergeAsk(null);
        handled.current = u.id;
        setTabAccount(u.id); // only this tab's own sign-out clears it (#169)
        writeDeviceAccount(u.id);
        adopt(true, u);
      });
      unsubscribe = () => data.subscription.unsubscribe();
    });
    // A magic link's tokens (authFragment.ts took them out of the URL): they sign in on their own
    // only when this browser asked for a link to that email in the last hour; else confirm first.
    const tokens = takeBootAuthTokens();
    const decision = tokens ? decideAuthLink(tokens, readSignInRequest()) : null;
    if (tokens && decision?.kind === 'auto') void acceptLink(tokens, decision.email);
    else if (tokens && decision?.kind === 'confirm')
      void Promise.resolve().then(() => setLinkAsk({ email: decision.email, tokens }));
    else if (decision?.kind === 'reject')
      toast({ title: "Couldn't sign in", description: BAD_LINK_MSG, tone: 'danger' });
    // A Google return (#482): its code signs in only with the verifier this browser kept, then
    // the same path as a link (the email the exchanged token names, checked by setSession).
    // LinkedIn's return takes the same path; its words come from the provider this browser started.
    const code = takeBootAuthCode();
    if (code) {
      const failed = oauthMessages().failed; // read before the exchange takes the record
      void loadPkce()
        .then((p) => p.oauthSession(code))
        .catch(() => null)
        .then((got) => {
          if (got) return acceptLink(got.tokens, got.email, failed);
          toast({ title: "Couldn't sign in", description: failed, tone: 'danger' });
        });
    }
    // A link signing in, or a stored session: the client is needed now.
    if (decision?.kind === 'auto' || needsClientAtBoot())
      void loadSupabase().catch(() => setAuthResolved(true));
    else if (!loadedSupabase()) {
      signedOut();
      void Promise.resolve().then(() => setAuthResolved(true));
    }
    // Another tab changed the stored session. Signed in here: a different account (or none) stops
    // this tab before its next sync (#288); the same account (a token refresh) changes nothing.
    // Stopped here: any sign-in keeps this tab's edits out of shared storage (sessionWhileFrozen).
    // Signed out here: load the client so this tab follows the sign-in through the whole path.
    const onStorage = (e: StorageEvent) => {
      if (!isAuthKey(e.key)) return;
      const why = sessionChange(e.newValue);
      const uid = storedSessionUser(e.newValue);
      if (why) freezeTab(why);
      else if (tabFrozen()) {
        if (uid) sessionWhileFrozen(uid);
      } else if (e.newValue) void loadSupabase().catch(() => {});
    };
    window.addEventListener('storage', onStorage);
    return () => {
      offLoaded();
      unsubscribe();
      window.removeEventListener('storage', onStorage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Set the session a link brought, then check it is the account the link named.
  /** Take a link's session up. True once this browser holds a real session for `email`; on any
   *  failure false, and (unless `quiet`, when the caller says it in place) a toast says so. */
  async function acceptLink(
    tokens: AuthTokens,
    email: string,
    failMsg = BAD_LINK_MSG,
    quiet = false,
  ): Promise<boolean> {
    clearSignInRequest();
    linkEmail.current = email;
    const fail = () => {
      if (!quiet) toast({ title: "Couldn't sign in", description: failMsg, tone: 'danger' });
      return false;
    };
    try {
      const supa = await loadSupabase();
      const r = await supa.auth.setSession(tokens);
      if (r.error || !r.data.user) return fail();
      if (!sameEmail(r.data.user.email, email)) {
        await supa.auth.signOut({ scope: 'local' });
        return fail();
      }
      return true;
    } catch {
      return fail();
    } finally {
      linkEmail.current = null;
    }
  }
  // Sign in on the confirm screen: the screen says "Signing in…" until the session is real, then
  // "Signed in" and its hand-over, and closes itself (closeLink). On a failure it stays, with the
  // reason in place (no toast behind it). A second press while one runs does nothing.
  const linkTaken = useRef(false);
  const confirmLink = async (): Promise<boolean> => {
    const ask = linkAsk;
    if (!ask || linkTaken.current) return false;
    linkTaken.current = true;
    const ok = await acceptLink(ask.tokens, ask.email, BAD_LINK_MSG, true);
    if (!ok) linkTaken.current = false;
    return ok;
  };
  const closeLink = () => {
    linkTaken.current = false;
    setLinkAsk(null);
  };
  // Cancel drops the tokens (the URL never kept them).
  const cancelLink = () => {
    if (!linkTaken.current) setLinkAsk(null);
  };

  const addDeviceData = () => {
    const ask = mergeAsk;
    setMergeAsk(null);
    if (!ask || mergeHeld.current !== ask.user.id) return;
    mergeHeld.current = null;
    handled.current = ask.user.id;
    setTabAccount(ask.user.id);
    writeDeviceAccount(ask.user.id);
    void adopt(true, ask.user);
  };
  // The default: sign out of that account and keep this device's data here, untouched.
  const keepDeviceData = () => {
    const ask = mergeAsk;
    setMergeAsk(null);
    if (!ask || mergeHeld.current !== ask.user.id) return;
    void loadSupabase()
      .then((supa) => supa.auth.signOut({ scope: 'local' }))
      .catch(() => {});
  };

  // push local changes (debounced); skip when nothing changed since the last sync
  useEffect(() => {
    if (!user || !pulled() || handled.current !== user.id || tabFrozen()) return;
    if (!dirty()) return;
    // An external store (the engine) changed: say so at once. The rule passed before only because
    // these checks read refs; the behaviour is the same (#814).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMsg('Saving…');
    clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => pushNow(user), 500);
    // pushNow/localJson are stable enough; we intentionally fire only on data + user changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    jobs,
    snippets,
    triage,
    targets,
    filters,
    evidence,
    modes,
    kit,
    sweeps,
    mustInclude,
    trash,
    dreams,
    documents,
    profiles,
    sources,
    decided,
    user,
  ]);

  // re-pull on focus
  useEffect(() => {
    const onFocus = () => {
      if (user) adopt(seedPending.current, user);
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Sign out clears local data (then reloads to a clean slate). Cloud data is untouched
  // and restored on next sign-in; this only protects shared devices.
  const signOut = async () => {
    // Frozen (#288): the shared session is another tab's now; signing it out would sign that tab
    // out. A reload is what this tab needs. Stopped by a newer version (#382), the session is this
    // tab's own: it signs out without a push (pushNow won't send), asking first as for a failed one.
    if (tabFrozen() && tabFrozen() !== 'newerVersion') return location.reload();
    // Flush edits still inside the push debounce (or a failed push) before the wipe.
    clearTimeout(pushTimer.current);
    let unsynced = false;
    if (user) {
      const hasData = localJson() !== JSON.stringify(S().writeBlob(S().emptyBlob()));
      // Nothing changed since the last pull or push: the cloud holds this copy, even while a
      // re-pull is out. Else it must go up now.
      const flushed = !dirty() || (pulled() && (await pushNow(user)));
      unsynced = !flushed && hasData;
    }
    // Track writes not yet in the cloud (refused, or still in flight) would be lost with the wipe.
    if (getPending().length > 0) unsynced = true;
    if (unsynced && !(await askSignOut())) return;
    liftNewerVersionFreeze(); // the wipe below must reach storage
    // Another tab may have signed in as someone else meanwhile (the flush or a confirm found it):
    // the shared session is that tab's now, and signing it out would sign that account out.
    if (tabFrozen() || (user && !(await sessionIsStill(user)))) return location.reload();
    setTabAccount(null); // this tab's own sign-out: not a change made in another tab
    handled.current = null;
    await (await loadSupabase()).auth.signOut();
    clearLocalData();
    location.reload();
  };

  // Delete removes the cloud row (RLS-scoped to this user) AND local data, then signs out.
  const deleteMyData = async () => {
    if (!user || (tabFrozen() && tabFrozen() !== 'newerVersion')) return;
    // The HDS confirm (DeleteDataConfirm.tsx; a browser confirm until #793). Cancel, Escape, Back
    // and the scrim all answer no.
    if (!(await askDelete())) return;
    // The confirm may have stayed open while another tab switched account (#288): then the
    // deletes would run under that account's session, and the sign-out below would end it.
    const stoppedByNewer = tabFrozen() === 'newerVersion';
    liftNewerVersionFreeze(); // a newer version's blob is deleted like any other (#382)
    if (!(await sessionIsStill(user))) return;
    setMsg('Deleting…');
    // No push after this one (#393): drop the debounced one, then wait out one already sent.
    deleting.current = true;
    clearTimeout(pushTimer.current);
    await Promise.allSettled([...pushing.current]);
    let authDeleted = false; // delete_my_data ran: the auth user and its sessions are gone too
    const why = await eraseCloud(user, () => (authDeleted = true));
    if (why) {
      deleting.current = false; // the local copy is kept, so syncing it may go on
      if (why === STOPPED) return; // the freeze notice says why; local copy kept
      // Keep this device's copy so nothing is lost while the cloud copy is only partly gone.
      // The newer version's blob may still be there: stay stopped, or the next push rewrites it.
      if (stoppedByNewer) freezeTab('newerVersion');
      setMsg(why);
      toast({
        title: 'Delete incomplete',
        description: why,
        tone: 'danger',
        actions: [RELOAD_ACTION],
      });
      return;
    }
    clearLocalData();
    clearDeviceAccount(); // the account is gone: a new one with this id never exists, but be plain
    setTabAccount(null);
    handled.current = null;
    // delete_my_data removed the auth user and its sessions (2026-11-13): end the session on this
    // device only; a global sign-out would ask the server about a user that is gone. The per-table
    // fallback leaves the auth user, so it still signs out everywhere (revoking other devices).
    await (await loadSupabase()).auth.signOut(authDeleted ? { scope: 'local' } : undefined);
    location.reload();
  };

  // Erase the account in the cloud: '' when it is gone, else what to tell the user (STOPPED when
  // another tab took the session). delete_my_data (#393) removes every per-user table in one
  // transaction; until it can run (see below) the tables the app writes are deleted
  // one by one, child → parent, so erasure never silently depends on the FK cascade. RLS scopes
  // each to this user. supabase-js reports failure as `{ error }`, not a throw.
  async function eraseCloud(u: User, onServerErase?: () => void): Promise<string> {
    const supa = await loadSupabase();
    if (!(await sessionIsStill(u))) return STOPPED;
    try {
      const r = await supa.rpc('delete_my_data', { p_user: u.id });
      if (!r.error) {
        onServerErase?.();
        return '';
      }
      // Not applied yet (PGRST202), or applied before the scorer's tables exist (42P01): the
      // tables the app writes are all there is to delete.
      if (r.error.code !== 'PGRST202' && r.error.code !== '42P01') return DELETE_FAILED;
    } catch {
      return DELETE_FAILED;
    }
    const failed: string[] = [];
    for (const table of DELETE_ORDER) {
      if (!(await sessionIsStill(u))) return STOPPED;
      try {
        const r = await supa.from(table).delete().eq('user_id', u.id);
        if (r.error) failed.push(table);
      } catch {
        failed.push(table);
      }
    }
    return failed.length ? deleteFailedMsg(failed) : '';
  }

  const sendLink = async (email: string): Promise<string | null> => {
    // The link lands on the app's root: remember this page so that tab comes back here, and that
    // this browser asked for it (a link it asked for signs in without the confirm, authLink.ts).
    rememberSignInReturn();
    rememberSignInRequest(email);
    let supa;
    try {
      supa = await loadSupabase(); // the first sign-in fetches the client
    } catch (e) {
      // The tab is older than the deploy (the notice offers Reload), else the network is down.
      return isChunkLoadError(e) ? STALE_MSG : signInErrorMessage({ message: 'Failed to fetch' });
    }
    const r = await supa.auth.signInWithOtp({
      email,
      // Only this app's own origins, at the root (#44). The real gate is the Supabase dashboard's
      // Redirect URLs allow-list (server side, Adrian's to keep); this keeps the ask honest.
      options: { emailRedirectTo: magicLinkRedirect(location) },
    });
    // The dialog shows the error inline, in plain words (no vendor message).
    return r.error ? signInErrorMessage(r.error) : null;
  };

  // "Continue with Google" (#482): the browser leaves for Google and comes back to the app's root
  // with `?code=…` (PKCE), which the boot path above swaps for a session with this browser's
  // verifier. Supabase links the Google identity to an existing account with the same verified
  // email, so that account's user id (and its sync base) is the one that comes back.
  // "Continue with LinkedIn" (Supabase's linkedin_oidc) is the same start with its provider id.
  const signInWithProvider = async (provider: OAuthProvider): Promise<string | null> => {
    rememberSignInReturn();
    try {
      const [supa, pkce] = await Promise.all([loadSupabase(), loadPkce()]);
      // Only this app's own origins, at the root (#44), as for the magic link.
      const err = await pkce.startOAuth(supa, provider, magicLinkRedirect(location));
      return err ? signInErrorMessage(err) : null; // null: the page is on its way to the provider
    } catch (e) {
      return isChunkLoadError(e) ? STALE_MSG : signInErrorMessage({ message: 'Failed to fetch' });
    }
  };
  const signInWithGoogle = () => signInWithProvider('google');
  const signInWithLinkedIn = () => signInWithProvider('linkedin_oidc');

  // A failed pull/push is a toast once per outage (not a banner): focus re-pulls and Retry
  // flip the status through "Refreshing…" but don't re-toast until a sync has succeeded again.
  // The account menu keeps the status line and a Retry while the outage lasts.
  // Tracks keep their own sync state (pending.ts), so a later good jobs push can't hide Retry.
  const tracksFailed = useFailedCount();
  const offline = msg === OFFLINE_MSG || tracksFailed > 0;
  const toastRef = useRef(toast);
  const outageToasted = useRef(false);
  useEffect(() => {
    toastRef.current = toast;
  });
  useEffect(() => {
    if (msg.startsWith('Synced')) outageToasted.current = false;
    if (msg !== OFFLINE_MSG || outageToasted.current) return;
    outageToasted.current = true;
    toastRef.current({
      title: OFFLINE_TITLE,
      description: OFFLINE_MSG,
      tone: 'warning',
      actions: [RELOAD_ACTION],
    });
  }, [msg]);

  // Another tab changed who is signed in (#288): say so once, and keep saying it in the menu.
  const frozenToasted = useRef(false);
  useEffect(
    () =>
      onTabFrozen((why) => {
        clearTimeout(pushTimer.current);
        const description = TAB_FROZEN_MESSAGE[why];
        setMsg(description);
        setPulling(false);
        if (frozenToasted.current) return; // a sign-out freeze turned switch: the menu line says it
        frozenToasted.current = true;
        toastRef.current({
          title: TAB_FROZEN_TITLE,
          description,
          tone: 'warning',
          duration: Infinity,
          actions: [RELOAD_ACTION],
        });
      }),
    [],
  );

  // A track change the cloud refused: one toast per burst (a starter pack writes many rows), with
  // Retry sync in the account menu until every refused write is delivered (the next sync replays
  // them, sync.ts). A new burst after that toasts again.
  const trackToasted = useRef(false);
  useEffect(() => {
    if (tracksFailed === 0) trackToasted.current = false;
  }, [tracksFailed]);
  useEffect(
    () =>
      onCurationWriteFailed(() => {
        if (trackToasted.current) return;
        trackToasted.current = true;
        toastRef.current({ ...TRACK_WRITE_FAILED, tone: 'warning', actions: [RELOAD_ACTION] });
      }),
    [],
  );

  // Stable unless what consumers read changes — the provider re-renders on every store change.
  const api: CloudSyncApi = useMemo(
    () => {
      // Signed out: read once the session check answers. Signed in: no pull running and the last
      // one didn't fail — an offline device can't know a job is gone, so it doesn't decide. Track
      // write failures don't count: they don't make a job's absence uncertain.
      const read =
        authResolved &&
        (!user || (pulledFor.current === user.id && !pulling && msg !== OFFLINE_MSG));
      // A tab stopped by another tab (#288) reads nothing more: settled for the UI, so nothing
      // waits forever, but never read (canWrite: no migration runs there).
      const stopped = !!tabFrozen();
      return {
        user,
        authResolved,
        settled: read || (authResolved && stopped),
        cloudRead: read && !stopped,
        status: msg,
        offline,
        sendLink,
        signInWithGoogle,
        signInWithLinkedIn,
        retry: () =>
          tabFrozen() ? location.reload() : user && void adopt(seedPending.current, user),
        signOut: () => void signOut(),
        deleteMyData: () => void deleteMyData(),
        signInOpen,
        accountTrigger,
        setAccountTrigger,
        setSignInOpen,
      };
    },
    // The handlers only close over `user` (and stable module state).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, authResolved, pulling, msg, offline, signInOpen, accountTrigger],
  );
  return (
    <CloudSyncContext.Provider value={api}>
      {children}
      {/* "Sign in as …?" is a full-screen step in the sign-in layout, in its own chunk (most
          visits never see it). Until the chunk is in, nothing is taken up. */}
      {linkAsk && (
        <Suspense fallback={null}>
          <LinkConfirmScreen
            email={linkAsk.email}
            onSignIn={confirmLink}
            onDone={closeLink}
            onCancel={cancelLink}
          />
        </Suspense>
      )}
      {/* "Add this device's N jobs to …?": its own chunk too (shown once per account, at most). */}
      {mergeAsk && (
        <Suspense fallback={null}>
          <MergeConfirmDialog
            question={mergeAsk.question}
            onAdd={addDeviceData}
            onKeep={keepDeviceData}
          />
        </Suspense>
      )}
      {/* "Delete all your data?": the HDS confirm in place of window.confirm (#793). */}
      {deleteAsk && (
        <Suspense fallback={null}>
          <DeleteDataConfirmDialog
            onDelete={() => answerDelete(true)}
            onCancel={() => answerDelete(false)}
          />
        </Suspense>
      )}
      {/* "Sign out and lose these changes?": the HDS confirm in place of window.confirm. */}
      {signOutAsk && (
        <Suspense fallback={null}>
          <SignOutConfirmDialog
            onSignOut={() => answerSignOut(true)}
            onCancel={() => answerSignOut(false)}
          />
        </Suspense>
      )}
    </CloudSyncContext.Provider>
  );
}
