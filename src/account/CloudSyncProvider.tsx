// Cloud sync (#31, #99) as a provider (#115 Phase 1): owns the Supabase session, the debounced
// push, the focus re-pull and sign-out/delete, and exposes them through CloudSyncContext. The UI
// lives elsewhere — the account menu, the one-time sync nudge and the sign-in dialog — and
// failures surface as toasts instead of a banner on every page.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useToast } from '@hirobius/design-system';
import type { User } from '@supabase/supabase-js';
import { supabase as supa } from '../supabase';
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
import { syncOnLogin, foldIntoStore, takeLocalLegacyTiles } from '../curation/sync';
import {
  getCurationSyncStatus,
  onCurationWriteFailed,
  setCurationSyncStatus,
} from '../curation/syncStatus';
import {
  OFFLINE_MSG,
  DELETE_ORDER,
  deleteFailedMsg,
  TRACK_WRITE_FAILED,
  UNSYNCED_SIGN_OUT,
  UNSYNCED_CHANGES_SIGN_OUT,
} from '../cloudMessages';
import { getPending, useFailedCount } from '../curation/pending';
import { EVIDENCE_TRIMMED, evidenceMergeOverflows } from '../radar/evidenceStore';
import { CloudSyncContext, type CloudSyncApi } from './accountContext';

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
  const trash = useTrash();
  const dreams = useAllDreams();
  const documents = useDocuments();
  const [user, setUser] = useState<User | null>(null);
  const [msg, setMsg] = useState('Sign in to sync across your devices');
  const [signInOpen, setSignInOpen] = useState(false);
  // True while a pull (adopt) is running: "settled" means none is, and the last one didn't fail.
  const [pulling, setPulling] = useState(false);
  // False until Supabase reports the stored session (or its absence), so signed-in users don't
  // see the signed-out nudge flash on load.
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
    trash: getTrash(),
    dreams: getAllDreams(),
    documents: getAllDocuments(),
    sourceV: BLOB_VERSION,
  });
  const localJson = () => JSON.stringify(writeBlob(localBlob()));

  async function pull(uid: string): Promise<SyncData | null> {
    const r = await supa.from('tracker').select('data').eq('user_id', uid).maybeSingle();
    if (r.error) throw new Error(r.error.message);
    return r.data ? readBlob(r.data.data) : null;
  }
  // Returns whether the cloud took it. `lastSynced` moves only on success, so a failed push
  // stays "dirty": the next refresh and sign-out both retry it.
  async function pushNow(u: User): Promise<boolean> {
    if (!pulledOk.current) return false;
    const sent = localJson();
    let ok: boolean;
    try {
      const r = await supa.from('tracker').upsert({
        user_id: u.id,
        data: writeBlob(localBlob()),
        updated_at: new Date().toISOString(),
      });
      ok = !r.error;
    } catch {
      ok = false;
    }
    if (ok) lastSynced.current = sent;
    setMsg(ok ? `Synced · ${u.email}` : OFFLINE_MSG);
    return ok;
  }
  const dirty = () => localJson() !== lastSynced.current;
  async function adopt(seed: boolean, u: User) {
    setMsg(seed ? 'Syncing…' : 'Refreshing…');
    setPulling(true);
    try {
      // Unsent local edits (a failed push) must go up before a pull would replace them.
      if (!seed && pulledOk.current && dirty() && !(await pushNow(u))) return;
      const cloud = await pull(u.id);
      const local = localBlob();
      const next = mergeBlob(cloud, local, seed);
      // A first-sign-in merge that keeps both evidence texts can pass the cap: say so, don't cut silently.
      if (seed && cloud && evidenceMergeOverflows(cloud.evidence, local.evidence))
        toast({ ...EVIDENCE_TRIMMED, tone: 'warning', duration: 10000 });
      replaceAll(next.jobs);
      replaceSnippets(next.copydeck);
      replaceTriage(next.triage);
      replaceTargets(next.targets);
      replaceFilters(next.filters);
      replaceEvidence(next.evidence);
      replaceModes(next.modes);
      replaceApplyKit(next.kit);
      replaceSweeps(next.sweeps);
      replaceTrash(next.trash);
      replaceDreams(next.dreams);
      replaceDocuments(next.documents);
      // Record what we just adopted so the resulting store changes don't echo a push.
      lastSynced.current = localJson();
      pulledOk.current = true;
      if (seed) seedPending.current = false;
      // Tracks live in their own tables: pull + reconcile + upload what's new here (#99).
      let curationOk = await syncOnLogin(u.id);
      // Retired user tiles (v3 cloud blob / this device's old store) fold into "My links" AFTER
      // the pull, so the fold sees the cloud's tracks + URLs; a second pass uploads the new rows.
      const legacy = [...next.legacyUserTiles, ...takeLocalLegacyTiles()];
      if (curationOk && legacy.length) {
        foldIntoStore(legacy);
        curationOk = await syncOnLogin(u.id);
      }
      // An older cloud copy lacks the newer fields (an old tab rewrote it): re-upload them now.
      if (seed || next.legacyUserTiles.length || next.sourceV < BLOB_VERSION) await pushNow(u);
      if (!curationOk) setMsg(OFFLINE_MSG);
      else if (!seed) setMsg(`Synced · ${u.email}`);
    } catch {
      setCurationSyncStatus('error');
      setMsg(OFFLINE_MSG);
    } finally {
      setPulling(false);
    }
  }

  // auth state. Token refreshes / profile updates aren't a new sign-in — don't re-run the
  // seed merge (it would also flip the sync gate mid-onboarding).
  useEffect(() => {
    void supa.auth.getSession().then(
      () => setAuthResolved(true),
      () => setAuthResolved(true),
    );
    const { data } = supa.auth.onAuthStateChange((event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      setAuthResolved(true);
      if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') return;
      pulledOk.current = false; // new sign-in or sign-out: the next pull must land before any push
      seedPending.current = !!u; // a sign-in owes a seed merge; sign-out or a user change resets it
      if (u) adopt(true, u);
      else {
        foldIntoStore(takeLocalLegacyTiles()); // signed out: fold this device's old links now
        if (getCurationSyncStatus() === 'syncing') setCurationSyncStatus('idle');
        setMsg('Sign in to sync across your devices');
      }
    });
    return () => data.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // push local changes (debounced); skip when nothing changed since the last sync
  useEffect(() => {
    if (!user || !pulledOk.current) return;
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
    // Flush edits still inside the push debounce (or a failed push) before the wipe.
    clearTimeout(pushTimer.current);
    if (user) {
      const hasData = localJson() !== JSON.stringify(writeBlob(emptyBlob()));
      const flushed = pulledOk.current && (!dirty() || (await pushNow(user)));
      if (!flushed && hasData && !window.confirm(UNSYNCED_CHANGES_SIGN_OUT)) return;
    }
    // Track writes not yet in the cloud (refused, or still in flight) would be lost with the wipe.
    if (getPending().length > 0 && !window.confirm(UNSYNCED_SIGN_OUT)) return;
    await supa.auth.signOut();
    clearLocalData();
    location.reload();
  };

  // Delete removes the cloud row (RLS-scoped to this user) AND local data, then signs out.
  const deleteMyData = async () => {
    if (!user) return;
    if (
      !window.confirm(
        'Delete all your synced data (jobs, categories, and boards) from the cloud and this device? This cannot be undone.',
      )
    )
      return;
    setMsg('Deleting…');
    // Erase curated content (child → parent) plus the sync blob. RLS scopes each delete to this
    // user; the FK cascade would cover the children, but we delete them explicitly so erasure
    // never silently depends on it. supabase-js reports failure as `{ error }`, not a throw.
    const failed: string[] = [];
    for (const table of DELETE_ORDER) {
      try {
        const r = await supa.from(table).delete().eq('user_id', user.id);
        if (r.error) failed.push(table);
      } catch {
        failed.push(table);
      }
    }
    if (failed.length) {
      // Keep this device's copy so nothing is lost while the cloud copy is only partly gone.
      const why = deleteFailedMsg(failed);
      setMsg(why);
      toast({ title: 'Delete incomplete', description: why, tone: 'danger' });
      return;
    }
    clearLocalData();
    await supa.auth.signOut();
    location.reload();
  };

  const sendLink = async (email: string): Promise<string | null> => {
    const r = await supa.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: location.origin + location.pathname },
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
    toastRef.current({ title: 'Sync paused', description: OFFLINE_MSG, tone: 'warning' });
  }, [msg]);

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
        toastRef.current({ ...TRACK_WRITE_FAILED, tone: 'warning' });
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
      retry: () => user && void adopt(seedPending.current, user),
      signOut: () => void signOut(),
      deleteMyData: () => void deleteMyData(),
      signInOpen,
      setSignInOpen,
    }),
    // The handlers only close over `user` (and stable module state).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, authResolved, pulling, msg, offline, signInOpen],
  );
  return <CloudSyncContext.Provider value={api}>{children}</CloudSyncContext.Provider>;
}
