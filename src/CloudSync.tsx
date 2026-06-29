import { useEffect, useRef, useState } from 'react';
import { Box, Button, Stack, TextField, Typography } from '@mui/material';
import { createClient, type User } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config';
import { useJobs, getAllJobs, replaceAll } from './store';
import { usePillars, getUserPillars, replaceUserPillars } from './pillarStore';
import { useSnippets, getSnippets, replaceSnippets, type Snippet } from './copyDeckStore';
import { useTileTriage, getTileTriage, replaceTriage } from './tileTriage';
import { useUserTiles, getUserTiles, replaceUserTiles } from './userTiles';
import type { Job } from './types';
import type { Pillar } from './pillars';
import type { Tile } from './jobsData';

const supa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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

type Triage = { pinned: string[]; dismissed: string[] };
type SyncData = {
  jobs: Job[];
  pillars: Pillar[];
  copydeck: Snippet[];
  triage: Triage;
  userTiles: Tile[];
};

// The cloud blob was historically a bare Job[]; it's now
// { v, jobs, pillars, copydeck, triage, userTiles }. Missing fields default to empty.
function readBlob(data: unknown): SyncData {
  const empty: SyncData = {
    jobs: [],
    pillars: [],
    copydeck: [],
    triage: { pinned: [], dismissed: [] },
    userTiles: [],
  };
  if (Array.isArray(data)) return { ...empty, jobs: data as Job[] };
  const o = (data ?? {}) as {
    jobs?: unknown;
    pillars?: unknown;
    copydeck?: unknown;
    triage?: unknown;
    userTiles?: unknown;
  };
  const tr = (o.triage ?? {}) as { pinned?: unknown; dismissed?: unknown };
  return {
    jobs: Array.isArray(o.jobs) ? (o.jobs as Job[]) : [],
    pillars: Array.isArray(o.pillars) ? (o.pillars as Pillar[]) : [],
    copydeck: Array.isArray(o.copydeck) ? (o.copydeck as Snippet[]) : [],
    triage: {
      pinned: Array.isArray(tr.pinned) ? (tr.pinned as string[]) : [],
      dismissed: Array.isArray(tr.dismissed) ? (tr.dismissed as string[]) : [],
    },
    userTiles: Array.isArray(o.userTiles) ? (o.userTiles as Tile[]) : [],
  };
}

function mergeJobs(cloud: Job[] | null, local: Job[]): Job[] {
  const by: Record<string, Job> = {};
  const order: string[] = [];
  const add = (it: Job) => {
    if (!it || !it.url) return;
    if (!(it.url in by)) order.push(it.url);
    by[it.url] = it;
  };
  (local || []).forEach(add);
  (cloud || []).forEach(add); // cloud wins on shared URLs
  return order.map((u) => by[u]);
}

function mergePillars(cloud: Pillar[] | null, local: Pillar[]): Pillar[] {
  const by: Record<string, Pillar> = {};
  const order: string[] = [];
  const add = (p: Pillar) => {
    if (!p || !p.id) return;
    if (!(p.id in by)) order.push(p.id);
    by[p.id] = p;
  };
  (local || []).forEach(add);
  (cloud || []).forEach(add); // cloud wins on shared ids
  return order.map((id) => by[id]);
}

function mergeSnippets(cloud: Snippet[] | null, local: Snippet[]): Snippet[] {
  const by: Record<string, Snippet> = {};
  const order: string[] = [];
  const add = (s: Snippet) => {
    if (!s || !s.id) return;
    if (!(s.id in by)) order.push(s.id);
    by[s.id] = s;
  };
  (local || []).forEach(add);
  (cloud || []).forEach(add); // cloud wins on shared ids
  return order.map((id) => by[id]);
}

function mergeTriage(cloud: Triage | null, local: Triage): Triage {
  const union = (a: string[] = [], b: string[] = []) => Array.from(new Set([...a, ...b]));
  const dismissed = new Set(union(local.dismissed, cloud?.dismissed));
  // pin and set-aside are mutually exclusive; set-aside wins a conflict.
  const pinned = union(local.pinned, cloud?.pinned).filter((u) => !dismissed.has(u));
  return { pinned, dismissed: [...dismissed] };
}

function mergeUserTiles(cloud: Tile[] | null, local: Tile[]): Tile[] {
  const by: Record<string, Tile> = {};
  const order: string[] = [];
  const add = (t: Tile) => {
    if (!t || !t.url) return;
    if (!(t.url in by)) order.push(t.url);
    by[t.url] = t;
  };
  (local || []).forEach(add);
  (cloud || []).forEach(add); // cloud wins on shared urls
  return order.map((u) => by[u]);
}

export default function CloudSync() {
  const jobs = useJobs();
  const pillars = usePillars();
  const snippets = useSnippets();
  const triage = useTileTriage();
  const userTiles = useUserTiles();
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('Sign in to sync across your devices');
  const lastSynced = useRef('');
  const pushTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const localJson = () =>
    JSON.stringify({
      jobs: getAllJobs(),
      pillars: getUserPillars(),
      copydeck: getSnippets(),
      triage: getTileTriage(),
      userTiles: getUserTiles(),
    });

  async function pull(uid: string): Promise<SyncData | null> {
    const r = await supa.from('tracker').select('data').eq('user_id', uid).maybeSingle();
    return r.data ? readBlob(r.data.data) : null;
  }
  async function pushNow(u: User) {
    const data = {
      v: 3,
      jobs: getAllJobs(),
      pillars: getUserPillars(),
      copydeck: getSnippets(),
      triage: getTileTriage(),
      userTiles: getUserTiles(),
    };
    const r = await supa
      .from('tracker')
      .upsert({ user_id: u.id, data, updated_at: new Date().toISOString() });
    lastSynced.current = localJson();
    setMsg(r.error ? 'Saved locally — cloud error' : `Synced · ${u.email}`);
  }
  async function adopt(seed: boolean, u: User) {
    setMsg(seed ? 'Syncing…' : 'Refreshing…');
    try {
      const cloud = await pull(u.id);
      const nextJobs = seed
        ? mergeJobs(cloud?.jobs ?? null, getAllJobs())
        : cloud
          ? cloud.jobs
          : getAllJobs();
      const nextPillars = seed
        ? mergePillars(cloud?.pillars ?? null, getUserPillars())
        : cloud
          ? cloud.pillars
          : getUserPillars();
      const nextCopydeck = seed
        ? mergeSnippets(cloud?.copydeck ?? null, getSnippets())
        : cloud
          ? cloud.copydeck
          : getSnippets();
      const nextTriage = seed
        ? mergeTriage(cloud?.triage ?? null, getTileTriage())
        : cloud
          ? cloud.triage
          : getTileTriage();
      const nextUserTiles = seed
        ? mergeUserTiles(cloud?.userTiles ?? null, getUserTiles())
        : cloud
          ? cloud.userTiles
          : getUserTiles();
      replaceAll(nextJobs);
      replaceUserPillars(nextPillars);
      replaceSnippets(nextCopydeck);
      replaceTriage(nextTriage);
      replaceUserTiles(nextUserTiles);
      // Record what we just adopted so the resulting store changes don't echo a push.
      lastSynced.current = localJson();
      if (seed) await pushNow(u);
      else setMsg(`Synced · ${u.email}`);
    } catch {
      setMsg('Saved locally — cloud error');
    }
  }

  // auth state
  useEffect(() => {
    const { data } = supa.auth.onAuthStateChange((_e, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) adopt(true, u);
      else setMsg('Sign in to sync across your devices');
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
  }, [jobs, pillars, snippets, triage, userTiles, user]);

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
        'Delete all your synced data (jobs and pillars) from the cloud and this device? This cannot be undone.',
      )
    )
      return;
    setMsg('Deleting…');
    try {
      await supa.from('tracker').delete().eq('user_id', user.id);
    } catch {
      /* ignore */
    }
    clearLocalData();
    await supa.auth.signOut();
    location.reload();
  };

  const sendLink = () => {
    const e = email.trim();
    if (!e) return;
    setMsg('Sending link…');
    supa.auth
      .signInWithOtp({
        email: e,
        options: { emailRedirectTo: location.origin + location.pathname },
      })
      .then((r) =>
        setMsg(
          r.error
            ? 'Could not send link: ' + r.error.message
            : `✓ Check ${e} for your sign-in link`,
        ),
      );
  };

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 1.25,
        mb: 2,
        p: 1.25,
        borderRadius: 2,
        bgcolor: 'background.paper',
        border: 1,
        borderColor: 'divider',
      }}
    >
      <Box
        sx={{
          width: 9,
          height: 9,
          borderRadius: '50%',
          bgcolor: user ? 'success.main' : 'text.disabled',
          flex: 'none',
        }}
      />
      <Typography
        variant="caption"
        color={user ? 'text.primary' : 'text.secondary'}
        sx={{ mr: 'auto' }}
      >
        {msg}
      </Typography>
      {user ? (
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
          <Button size="small" variant="outlined" onClick={signOut}>
            Sign out
          </Button>
          <Button size="small" variant="text" color="error" onClick={deleteMyData}>
            Delete my data
          </Button>
        </Stack>
      ) : (
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
          <TextField
            size="small"
            type="email"
            placeholder="you@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') sendLink();
            }}
            sx={{ minWidth: 200 }}
          />
          <Button size="small" variant="contained" onClick={sendLink}>
            Email me a link
          </Button>
        </Stack>
      )}
    </Box>
  );
}
