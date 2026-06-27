import { useEffect, useRef, useState } from 'react';
import { Box, Button, Stack, TextField, Typography } from '@mui/material';
import { createClient, type User } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config';
import { useJobs, getAllJobs, replaceAll } from './store';
import { usePillars, getUserPillars, replaceUserPillars } from './pillarStore';
import { useSnippets, getSnippets, replaceSnippets, type Snippet } from './copyDeckStore';
import type { Job } from './types';
import type { Pillar } from './pillars';

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

type SyncData = { jobs: Job[]; pillars: Pillar[]; copydeck: Snippet[] };

// The cloud blob was historically a bare Job[]; it's now { v, jobs, pillars, copydeck }.
function readBlob(data: unknown): SyncData {
  if (Array.isArray(data)) return { jobs: data as Job[], pillars: [], copydeck: [] };
  const o = (data ?? {}) as { jobs?: unknown; pillars?: unknown; copydeck?: unknown };
  return {
    jobs: Array.isArray(o.jobs) ? (o.jobs as Job[]) : [],
    pillars: Array.isArray(o.pillars) ? (o.pillars as Pillar[]) : [],
    copydeck: Array.isArray(o.copydeck) ? (o.copydeck as Snippet[]) : [],
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

export default function CloudSync() {
  const jobs = useJobs();
  const pillars = usePillars();
  const snippets = useSnippets();
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('Sign in to sync across your devices');
  const lastSynced = useRef('');
  const pushTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const localJson = () =>
    JSON.stringify({ jobs: getAllJobs(), pillars: getUserPillars(), copydeck: getSnippets() });

  async function pull(uid: string): Promise<SyncData | null> {
    const r = await supa.from('tracker').select('data').eq('user_id', uid).maybeSingle();
    return r.data ? readBlob(r.data.data) : null;
  }
  async function pushNow(u: User) {
    const data = { v: 2, jobs: getAllJobs(), pillars: getUserPillars(), copydeck: getSnippets() };
    const r = await supa
      .from('tracker')
      .upsert({ user_id: u.id, data, updated_at: new Date().toISOString() });
    lastSynced.current = JSON.stringify({
      jobs: data.jobs,
      pillars: data.pillars,
      copydeck: data.copydeck,
    });
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
      replaceAll(nextJobs);
      replaceUserPillars(nextPillars);
      replaceSnippets(nextCopydeck);
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
  }, [jobs, pillars, snippets, user]);

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
