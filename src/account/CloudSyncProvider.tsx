// Cloud sync (#31, #99) as a provider (#115 Phase 1): owns the Supabase session, the debounced
// push, the focus re-pull and sign-out/delete, and exposes them through CloudSyncContext. The UI
// lives elsewhere — the account menu, the one-time sync nudge and the sign-in dialog — and
// failures surface as toasts instead of a banner on every page.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useToast } from '@hirobius/design-system';
import type { User } from '@supabase/supabase-js';
import { loadedSupabase, loadSupabase, needsClientAtBoot, onSupabaseLoaded } from '../supabase';
import { signInErrorMessage } from './signInErrors';
import { useJobs, getAllJobs, replaceAll } from '../store';
import { useSnippets, getSnippets, replaceSnippets } from '../copyDeckStore';
import { useTileTriage, getTileTriage, replaceTriage } from '../tileTriage';
import { getAllTargets, replaceTargets, useAllTargets } from '../feed/targets';
import { getAllFilters, replaceFilters, useAllFilters } from '../feed/savedFilters';
import { readEvidence, replaceEvidence, useEvidence } from '../radar/evidenceStore';
import { getAllModes, replaceModes, useAllModes } from '../trackModes';
import { getApplyKit, replaceApplyKit, useApplyKit } from '../applyKit';
import { getAllSweeps, replaceSweeps, useAllSweeps } from '../feed/sweepTitles';
import { getAllMustInclude, replaceMustInclude, useAllMustInclude } from '../feed/mustInclude';
import { getTrash, replaceTrash, useTrash } from '../trash';
import { getAllDreams, replaceDreams, useAllDreams } from '../feed/dreams';
import { getAllDocuments, replaceDocuments, useDocuments } from '../documents';
import {
  readBlob,
  writeBlob,
  mergeBlob,
  emptyBlob,
  BLOB_VERSION,
  type SyncData,
} from '../syncBlob';
import { hashesOf, keysOf, readSyncBase, readSyncHashes, writeSyncBase } from '../syncBase';
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
  UNSYNCED_SIGN_OUT,
  UNSYNCED_CHANGES_SIGN_OUT,
  RELOAD_ACTION,
  TAB_FROZEN_MESSAGE,
  TAB_FROZEN_TITLE,
} from '../cloudMessages';
import { getPending, useFailedCount } from '../curation/pending';
import { EVIDENCE_TRIMMED, evidenceMergeOverflows } from '../radar/evidenceStore';
import { CloudSyncContext, type CloudSyncApi } from './accountContext';
import { magicLinkRedirect } from './authRedirect';
import { rememberSignInReturn, returnAfterSignIn } from './signInReturn';
import { isChunkLoadError } from '../chunkError';
import { STALE_MSG } from '../staleBuild';
import { takeBootAuthTokens, type AuthTokens } from '../authFragment';
import {
  clearSignInRequest,
  decideAuthLink,
  readSignInRequest,
  rememberSignInRequest,
  sameEmail,
} from './authLink';
import { deviceData, mergeQuestion } from './deviceData';
import { dropSampleTrack } from '../demo/sampleTrack';
import { LinkConfirmDialog, MergeConfirmDialog } from './AuthGuards';

const BAD_LINK_MSG = 'That sign-in link could not be used. Send a new one from Account.';

/** The cloud row as this tab last read or wrote it: whether there is one, and its stamp. */
type RowStamp = { row: boolean; at: string | null };
/** How many times a push merges a newer cloud copy in and sends again before it gives up. */
const PUSH_TRIES = 3;
/** A stamp after `at`, even when this device's clock is behind the one that wrote it. */
function nextStamp(at: string | null): string {
  const last = at ? Date.parse(at) : NaN;
  return new Date(Number.isNaN(last) ? Date.now() : Math.max(Date.now(), last + 1)).toISOString();
}
/** What the cloud holds, as the base the next merge compares against (#219, entry hashes). */
function rememberBase(uid: string, d: SyncData) {
  writeSyncBase(uid, keysOf(d), hashesOf(d));
}

// Wipe this device's app data (keeps the color-mode preference). Used on sign-out and
// delete so a shared browser can't carry one person's jobs/pillars/résumé to the next.
function clearLocalData() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith('rjb_') && k !== 'rjb_color_mode')
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
  const [user, setUser] = useState<User | null>(null);
  const [msg, setMsg] = useState('Sign in to sync across your devices');
  const [signInOpen, setSignInOpen] = useState(false);
  const [accountTrigger, setAccountTrigger] = useState<HTMLButtonElement | null>(null);
  // True while a pull (adopt) is running: "settled" means none is, and the last one didn't fail.
  const [pulling, setPulling] = useState(false);
  // False until Supabase reports the stored session (or its absence), so signed-in users don't
  // see the signed-out nudge flash on load. With no session stored (and no magic link returning)
  // the client isn't loaded at all (supabase.ts): signed out, answered a tick later as before.
  const [authResolved, setAuthResolved] = useState(false);
  const lastSynced = useRef('');
  // True once a pull since sign-in has merged the cloud copy in. Until then local data is
  // unmerged, so pushing it would overwrite cloud-only jobs (#161).
  const pulledOk = useRef(false);
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
  // The cloud row's stamp as of this tab's last pull or push (null until a pull lands). A push
  // only writes over that version: another device's newer save is merged in first, never wiped.
  const known = useRef<RowStamp | null>(null);
  // A sign-in link nobody asked for in this browser, waiting on "Sign in as x@y.com?".
  const [linkAsk, setLinkAsk] = useState<{ email: string; tokens: AuthTokens } | null>(null);
  // An account this device never synced with, while it holds data: "Add this device's N jobs?".
  // Until it is answered nothing is pulled or pushed (adopt waits on it).
  const [mergeAsk, setMergeAsk] = useState<{ user: User; question: string } | null>(null);
  const mergeHeld = useRef<string | null>(null);
  // The user that passed the whole sign-in path (email check, then the merge guard). Nothing is
  // pulled or pushed for anyone else, and only their token refreshes skip that path: an expired
  // crafted link is refreshed by supabase-js (TOKEN_REFRESHED, not SIGNED_IN), security re-check.
  const handled = useRef<string | null>(null);
  // While a link's session is being set: the email it was accepted for. Another account is not
  // taken up at all (acceptLink signs it out), so nothing of it is pulled first.
  const linkEmail = useRef<string | null>(null);

  const localBlob = (): SyncData => ({
    jobs: getAllJobs(),
    copydeck: getSnippets(),
    triage: getTileTriage(),
    legacyUserTiles: [],
    targets: getAllTargets(),
    filters: getAllFilters(),
    evidence: readEvidence(),
    modes: getAllModes(),
    kit: getApplyKit(),
    sweeps: getAllSweeps(),
    mustInclude: getAllMustInclude(),
    trash: getTrash(),
    dreams: getAllDreams(),
    documents: getAllDocuments(),
    sourceV: BLOB_VERSION,
  });
  const localJson = () => JSON.stringify(writeBlob(localBlob()));

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

  async function pull(uid: string): Promise<{ blob: SyncData | null; stamp: RowStamp }> {
    const supa = await loadSupabase();
    const r = await supa
      .from('tracker')
      .select('data, updated_at')
      .eq('user_id', uid)
      .maybeSingle();
    if (r.error) throw new Error(r.error.message);
    if (!r.data) return { blob: null, stamp: { row: false, at: null } };
    return {
      blob: readBlob(r.data.data),
      stamp: { row: true, at: (r.data.updated_at as string | null) ?? null },
    };
  }
  // Write the row only over the version this tab last saw (optimistic concurrency): a conditional
  // update on its stamp, or an insert when there was no row. Postgres re-checks the condition
  // under the row lock, so two devices sending at once can't both win. 'conflict' = another
  // device wrote first.
  async function writeRow(uid: string, data: unknown): Promise<'ok' | 'conflict' | 'fail'> {
    const was = known.current;
    if (!was) return 'fail';
    const supa = await loadSupabase();
    const updated_at = nextStamp(was.at);
    let rows: { updated_at?: string | null }[] | null;
    if (!was.row) {
      const r = await supa
        .from('tracker')
        .insert({ user_id: uid, data, updated_at })
        .select('updated_at');
      if (r.error) return r.error.code === '23505' ? 'conflict' : 'fail';
      rows = r.data;
    } else {
      const q = supa.from('tracker').update({ data, updated_at }).eq('user_id', uid);
      const r = await (
        was.at === null ? q.is('updated_at', null) : q.eq('updated_at', was.at)
      ).select('updated_at');
      if (r.error) return 'fail';
      if (!r.data?.length) return 'conflict';
      rows = r.data;
    }
    known.current = { row: true, at: rows?.[0]?.updated_at ?? updated_at };
    return 'ok';
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
    if (!pulledOk.current || handled.current !== u.id || tabFrozen() || deleting.current)
      return false;
    let ok = false;
    for (let i = 0; i < PUSH_TRIES && !ok; i++) {
      const sent = localJson();
      const data = writeBlob(localBlob());
      let r: 'ok' | 'conflict' | 'fail';
      try {
        if (!(await sessionIsStill(u)) || deleting.current) return false;
        r = await writeRow(u.id, data);
      } catch {
        r = 'fail';
      }
      if (r === 'ok') {
        ok = true;
        lastSynced.current = sent;
        rememberBase(u.id, readBlob(data)); // what the cloud now holds (#219)
      } else if (r === 'fail') break;
      else {
        try {
          if (!(await mergeIn(u, true))) return false;
        } catch {
          break;
        }
      }
    }
    if (!tabFrozen()) setMsg(ok ? `Synced · ${u.email}` : OFFLINE_MSG); // else the notice stays
    return ok;
  }
  const dirty = () => localJson() !== lastSynced.current;

  function applyBlob(next: SyncData) {
    replaceAll(next.jobs);
    replaceSnippets(next.copydeck);
    replaceTriage(next.triage);
    replaceTargets(next.targets);
    replaceFilters(next.filters);
    replaceEvidence(next.evidence);
    replaceModes(next.modes);
    replaceApplyKit(next.kit);
    replaceSweeps(next.sweeps);
    replaceMustInclude(next.mustInclude);
    replaceTrash(next.trash);
    replaceDreams(next.dreams);
    replaceDocuments(next.documents);
  }

  // Pull the cloud copy and merge it into this device's stores. `both` (a sign-in, or a push the
  // cloud turned down) merges both sides; else the cloud copy is the truth, unless an edit landed
  // here while the pull was out: then both sides merge too, so the edit is not replaced (audit 3).
  // Returns null when the account changed meanwhile (or every pull raced a push from this tab);
  // `merged` says whether both sides merged.
  async function mergeIn(
    u: User,
    both: boolean,
  ): Promise<{ next: SyncData; merged: boolean } | null> {
    let got: Awaited<ReturnType<typeof pull>> | null = null;
    // A push from this tab that lands while the pull is out makes its copy older than the cloud's:
    // adopting it would revert that push here and rewind the stamp, so pull again.
    for (let i = 0; i < PUSH_TRIES && !got; i++) {
      if (!(await sessionIsStill(u))) return null;
      const seen = known.current;
      const r = await pull(u.id);
      // Signed out (or another account, here or in another tab) while it pulled, or deleting.
      if (handled.current !== u.id || deleting.current || !(await sessionIsStill(u))) return null;
      if (known.current === seen) got = r;
    }
    if (!got) return null;
    const { blob: cloud, stamp } = got;
    // Written by a newer version (#382): adopting it would read it without the fields this one
    // doesn't know, and the next push would rewrite it without them. Stop instead.
    if (cloud && cloud.sourceV > BLOB_VERSION) {
      freezeTab('newerVersion');
      return null;
    }
    const merged = both || (pulledOk.current && dirty());
    const local = localBlob();
    const next = mergeBlob(cloud, local, merged, readSyncBase(u.id), readSyncHashes(u.id));
    rememberBase(u.id, cloud ?? emptyBlob());
    known.current = stamp;
    // A merge that keeps both evidence texts can pass the cap: say so, don't cut silently.
    if (merged && cloud && evidenceMergeOverflows(cloud.evidence, local.evidence))
      toast({ ...EVIDENCE_TRIMMED, tone: 'warning', duration: 10000 });
    applyBlob(next);
    // Record what we just adopted so the resulting store changes don't echo a push.
    lastSynced.current = localJson();
    return { next, merged };
  }
  async function adopt(seed: boolean, u: User) {
    // Not through the sign-in path (the merge question is open), or stopped by another tab (#288).
    if (handled.current !== u.id || tabFrozen() || deleting.current) return;
    setMsg(seed ? 'Syncing…' : 'Refreshing…');
    setPulling(true);
    try {
      // Unsent local edits (a failed push) must go up before a pull would replace them.
      if (!seed && pulledOk.current && dirty() && !(await pushNow(u))) return;
      const got = await mergeIn(u, seed);
      if (!got) return;
      const { next, merged } = got;
      pulledOk.current = true;
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
      if (merged || next.legacyUserTiles.length || next.sourceV < BLOB_VERSION) await pushNow(u);
      if (tabFrozen()) return; // the notice stays in the menu (#288)
      if (!curationOk) setMsg(OFFLINE_MSG);
      else if (!seed) setMsg(`Synced · ${u.email}`);
    } catch {
      setCurationSyncStatus('error');
      if (!tabFrozen()) setMsg(OFFLINE_MSG);
    } finally {
      setPulling(false);
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
        // Only a refresh for the user already through the path below is not a new sign-in.
        const refresh = event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED';
        if (refresh && u && handled.current === u.id) return;
        handled.current = null;
        setTabAccount(null); // until the path below has run for this user
        // Opened from the magic link: back to the page the link was asked for on (return paths).
        if (event === 'SIGNED_IN') returnAfterSignIn();
        pulledOk.current = false; // new sign-in or sign-out: the next pull must land before any push
        known.current = null;
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
        // Never fold this device's data into an account it has not synced with without asking:
        // a crafted link could be someone else's account (login injection, security audit).
        const held =
          readSyncBase(u.id) === null
            ? deviceData(localBlob(), getCurationState().categories.length)
            : null;
        if (held?.any) {
          mergeHeld.current = u.id;
          setMergeAsk({ user: u, question: mergeQuestion(held, u.email ?? 'this account') });
          return;
        }
        mergeHeld.current = null;
        setMergeAsk(null);
        handled.current = u.id;
        setTabAccount(u.id); // only this tab's own sign-out clears it (#169)
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
  async function acceptLink(tokens: AuthTokens, email: string) {
    clearSignInRequest();
    linkEmail.current = email;
    try {
      const supa = await loadSupabase();
      const r = await supa.auth.setSession(tokens);
      if (r.error || !r.data.user) {
        toast({ title: "Couldn't sign in", description: BAD_LINK_MSG, tone: 'danger' });
        return;
      }
      if (!sameEmail(r.data.user.email, email)) {
        await supa.auth.signOut({ scope: 'local' });
        toast({ title: "Couldn't sign in", description: BAD_LINK_MSG, tone: 'danger' });
      }
    } catch {
      toast({ title: "Couldn't sign in", description: BAD_LINK_MSG, tone: 'danger' });
    } finally {
      linkEmail.current = null;
    }
  }
  const confirmLink = () => {
    const ask = linkAsk;
    setLinkAsk(null);
    if (ask) void acceptLink(ask.tokens, ask.email);
  };
  // Cancel drops the tokens (the URL never kept them).
  const cancelLink = () => setLinkAsk(null);

  const addDeviceData = () => {
    const ask = mergeAsk;
    setMergeAsk(null);
    if (!ask || mergeHeld.current !== ask.user.id) return;
    mergeHeld.current = null;
    handled.current = ask.user.id;
    setTabAccount(ask.user.id);
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
    if (!user || !pulledOk.current || handled.current !== user.id || tabFrozen()) return;
    if (localJson() === lastSynced.current) return;
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
    if (user) {
      const hasData = localJson() !== JSON.stringify(writeBlob(emptyBlob()));
      const flushed = pulledOk.current && (!dirty() || (await pushNow(user)));
      if (!flushed && hasData && !window.confirm(UNSYNCED_CHANGES_SIGN_OUT)) return;
    }
    // Track writes not yet in the cloud (refused, or still in flight) would be lost with the wipe.
    if (getPending().length > 0 && !window.confirm(UNSYNCED_SIGN_OUT)) return;
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
    if (
      !window.confirm(
        'Delete all your synced data (jobs, tracks, boards, watched companies and scored postings) from the cloud and this device? This cannot be undone.',
      )
    )
      return;
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
    const why = await eraseCloud(user);
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
    setTabAccount(null);
    handled.current = null;
    await (await loadSupabase()).auth.signOut();
    location.reload();
  };

  // Erase the account in the cloud: '' when it is gone, else what to tell the user (STOPPED when
  // another tab took the session). delete_my_data (#393) removes every per-user table in one
  // transaction; until it can run (see below) the tables the app writes are deleted
  // one by one, child → parent, so erasure never silently depends on the FK cascade. RLS scopes
  // each to this user. supabase-js reports failure as `{ error }`, not a throw.
  async function eraseCloud(u: User): Promise<string> {
    const supa = await loadSupabase();
    if (!(await sessionIsStill(u))) return STOPPED;
    try {
      const r = await supa.rpc('delete_my_data', { p_user: u.id });
      if (!r.error) return '';
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
    () => ({
      user,
      authResolved,
      // Signed out: settled once the session check answers. Signed in: no pull running and the
      // last one didn't fail — an offline device can't know a job is gone, so it doesn't decide.
      // Track write failures don't count: they don't make a job's absence uncertain.
      settled: authResolved && (!user || (!pulling && msg !== OFFLINE_MSG)),
      status: msg,
      offline,
      sendLink,
      retry: () =>
        tabFrozen() ? location.reload() : user && void adopt(seedPending.current, user),
      signOut: () => void signOut(),
      deleteMyData: () => void deleteMyData(),
      signInOpen,
      accountTrigger,
      setAccountTrigger,
      setSignInOpen,
    }),
    // The handlers only close over `user` (and stable module state).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, authResolved, pulling, msg, offline, signInOpen, accountTrigger],
  );
  return (
    <CloudSyncContext.Provider value={api}>
      {children}
      <LinkConfirmDialog
        email={linkAsk?.email ?? null}
        onSignIn={confirmLink}
        onCancel={cancelLink}
      />
      <MergeConfirmDialog
        question={mergeAsk?.question ?? null}
        onAdd={addDeviceData}
        onKeep={keepDeviceData}
      />
    </CloudSyncContext.Provider>
  );
}
