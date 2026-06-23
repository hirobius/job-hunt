import { useEffect, useRef, useState } from 'react';
import { Box, Button, Stack, TextField, Typography } from '@mui/material';
import { createClient, type User } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config';
import { useJobs, getAllJobs, replaceAll } from './store';
import type { Job } from './types';

const supa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function mergeLists(cloud: Job[] | null, local: Job[]): Job[] {
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

export default function CloudSync() {
  const jobs = useJobs();
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('Sign in to sync across your devices');
  const applying = useRef(false);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  async function pull(uid: string): Promise<Job[] | null> {
    const r = await supa.from('tracker').select('data').eq('user_id', uid).maybeSingle();
    return (r.data?.data as Job[]) ?? null;
  }
  async function pushNow(arr: Job[], u: User) {
    const r = await supa
      .from('tracker')
      .upsert({ user_id: u.id, data: arr, updated_at: new Date().toISOString() });
    setMsg(r.error ? 'Saved locally — cloud error' : `Synced · ${u.email}`);
  }
  async function adopt(seed: boolean, u: User) {
    setMsg(seed ? 'Syncing…' : 'Refreshing…');
    try {
      const cloud = await pull(u.id);
      const next = seed ? mergeLists(cloud, getAllJobs()) : cloud != null ? cloud : getAllJobs();
      applying.current = true;
      replaceAll(next);
      // push the sanitized stored list back (cleans any <> / dupes in the cloud blob)
      if (seed) await pushNow(getAllJobs(), u);
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

  // push local changes (debounced); skip the change we just applied from cloud
  useEffect(() => {
    if (!user) return;
    if (applying.current) {
      applying.current = false;
      return;
    }
    setMsg('Saving…');
    clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => pushNow(getAllJobs(), user), 500);
  }, [jobs, user]);

  // re-pull on focus
  useEffect(() => {
    const onFocus = () => {
      if (user && !applying.current) adopt(false, user);
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

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
        <Button size="small" variant="outlined" onClick={() => supa.auth.signOut()}>
          Sign out
        </Button>
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
