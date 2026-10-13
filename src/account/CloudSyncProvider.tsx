// Cloud sync (#31, #99) as a provider (#115 Phase 1): owns the Supabase session, the debounced
// push, the focus re-pull and sign-out/delete, and exposes them through CloudSyncContext. The UI
// lives elsewhere — the account menu, the one-time sync nudge and the sign-in dialog — and
// failures surface as toasts instead of a banner on every page.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useToast } from '@hirobius/design-system';
import type { User } from '@supabase/supabase-js';
import { supabase as supa } from '../supabase';
import { useJobs, getAllJobs, replaceAll } from '../store';
import { useSnippets, getSnippets, replaceSnippets } from '../copyDeckStore';
import { useTileTriage, getTileTriage, replaceTriage } from '../tileTriage';
import { readBlob, writeBlob, mergeBlob, type SyncData } from '../syncBlob';
import { syncOnLogin, foldIntoStore, takeLocalLegacyTiles } from '../curation/sync';
import { getCurationSyncStatus, setCurationSyncStatus } from '../curation/syncStatus';
import { OFFLINE_MSG, DELETE_ORDER, deleteFailedMsg } from '../cloudMessages';
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
  const [user, setUser] = useState<User | null>(null);
  const [msg, setMsg] = useState('Sign in to sync across your devices');
  const [signInOpen, setSignInOpen] = useState(false);
  const lastSynced = useRef('');
  const pushTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const localBlob = (): SyncData => ({
    jobs: getAllJobs(),
    copydeck: getSnippets(),
    triage: getTileTriage(),
    legacyUserTiles: [],
  });
  const localJson = () => JSON.stringify(writeBlob(localBlob()));

  async function pull(uid: string): Promise<SyncData | null> {
    const r = await supa.from('tracker').select('data').eq('user_id', uid).maybeSingle();
    if (r.error) throw new Error(r.error.message);
    return r.data ? readBlob(r.data.data) : null;
  }
  async function pushNow(u: User) {
    const r = await supa.from('tracker').upsert({
      user_id: u.id,
      data: writeBlob(localBlob()),
      updated_at: new Date().toISOString(),
    });
    lastSynced.current = localJson();
    setMsg(r.error ? OFFLINE_MSG : `Synced · ${u.email}`);
  }
  async function adopt(seed: boolean, u: User) {
    setMsg(seed ? 'Syncing…' : 'Refreshing…');
    try {
      const next = mergeBlob(await pull(u.id), localBlob(), seed);
      replaceAll(next.jobs);
      replaceSnippets(next.copydeck);
      replaceTriage(next.triage);
      // Record what we just adopted so the resulting store changes don't echo a push.
      lastSynced.current = localJson();
      // Tracks live in their own tables: pull + reconcile + upload what's new here (#99).
      let curationOk = await syncOnLogin(u.id);
      // Retired user tiles (v3 cloud blob / this device's old store) fold into "My links" AFTER
      // the pull, so the fold sees the cloud's tracks + URLs; a second pass uploads the new rows.
      const legacy = [...next.legacyUserTiles, ...takeLocalLegacyTiles()];
      if (curationOk && legacy.length) {
        foldIntoStore(legacy);
        curationOk = await syncOnLogin(u.id);
      }
      if (seed || next.legacyUserTiles.length) await pushNow(u);
      if (!curationOk) setMsg(OFFLINE_MSG);
      else if (!seed) setMsg(`Synced · ${u.email}`);
    } catch {
      setCurationSyncStatus('error');
      setMsg(OFFLINE_MSG);
    }
  }

  // auth state. Token refreshes / profile updates aren't a new sign-in — don't re-run the
  // seed merge (it would also flip the sync gate mid-onboarding).
  useEffect(() => {
    const { data } = supa.auth.onAuthStateChange((event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') return;
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
    if (!user) return;
    if (localJson() === lastSynced.current) return;
    setMsg('Saving…');
    clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => pushNow(user), 500);
    // pushNow/localJson are stable enough; we intentionally fire only on data + user changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, snippets, triage, user]);

  // re-pull on focus
  useEffect(() => {
    const onFocus = () => {
      if (user) adopt(false, user);
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Sign out clears local data (then reloads to a clean slate). Cloud data is untouched
  // and restored on next sign-in; this only protects shared devices.
  const signOut = async () => {
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
    if (!r.error) return null;
    const why = 'Could not send link: ' + r.error.message;
    toast({ title: 'Sign-in link not sent', description: r.error.message, tone: 'danger' });
    return why;
  };

  // A failed pull/push is a toast once per outage (not a banner); the account menu keeps the
  // status line and a Retry while it lasts.
  const offline = msg === OFFLINE_MSG;
  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
  });
  useEffect(() => {
    if (offline)
      toastRef.current({ title: 'Sync paused', description: OFFLINE_MSG, tone: 'warning' });
  }, [offline]);

  const api: CloudSyncApi = {
    user,
    status: msg,
    offline,
    sendLink,
    retry: () => user && void adopt(false, user),
    signOut: () => void signOut(),
    deleteMyData: () => void deleteMyData(),
    signInOpen,
    setSignInOpen,
  };
  return <CloudSyncContext.Provider value={api}>{children}</CloudSyncContext.Provider>;
}
