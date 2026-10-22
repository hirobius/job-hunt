// The app's ONE Supabase client (anon key, RLS-scoped). CloudSync (tracker blob + auth) and the
// curation store/sync (categories/groups/tiles) both use it — two clients meant two GoTrue
// instances fighting over the same persisted session (#99).
//
// Loaded lazily: supabase-js is ~55 kB gzipped and a signed-out visitor never needs it. The client
// is built on first `loadSupabase()`, which CloudSync calls at boot only when a session is stored
// or a magic link has just returned (`needsClientAtBoot`), and otherwise on sign-in.
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config';
import { importFresh } from './staleBuild';

/** True when a Supabase session is persisted in this browser (read synchronously at boot, before
 *  the auth listener fires) — lets the UI wait for a sign-in pull instead of flashing onboarding. */
export function hasPersistedSession(
  storage: Pick<Storage, 'length' | 'key'> = localStorage,
): boolean {
  try {
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) return true;
    }
  } catch {
    /* storage unavailable */
  }
  return false;
}

export interface AuthCallback {
  access_token: string;
  refresh_token: string;
}

/** The tokens a magic link brings back in the URL hash (implicit flow), or null. */
export function readAuthCallback(hash: string): AuthCallback | null {
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  const access_token = p.get('access_token');
  const refresh_token = p.get('refresh_token');
  return access_token && refresh_token ? { access_token, refresh_token } : null;
}

// Read once at module load, before the router rewrites the hash: the client may arrive after the
// shell has replaced `#access_token=…` with a route, so the tokens are handed over explicitly.
const bootCallback = typeof window === 'undefined' ? null : readAuthCallback(window.location.hash);

/** Whether the client is needed right away: a stored session, or a magic link just returned. */
export function needsClientAtBoot(): boolean {
  return bootCallback !== null || hasPersistedSession();
}

let client: Promise<SupabaseClient> | null = null;
let loaded: SupabaseClient | null = null;
const listeners = new Set<(c: SupabaseClient) => void>();

/** The shared client, built on first call (the supabase-js chunk is fetched then). */
export function loadSupabase(): Promise<SupabaseClient> {
  client ??= importFresh(() => import('@supabase/supabase-js'))().then(
    ({ createClient }) => {
      const c = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      loaded = c;
      listeners.forEach((l) => l(c));
      listeners.clear();
      // Still in the URL → supabase-js reads it itself; gone (routed away) → hand it over.
      if (bootCallback && !readAuthCallback(window.location.hash))
        void c.auth.setSession(bootCallback).catch(() => {});
      return c;
    },
    (e: unknown) => {
      client = null; // a failed chunk fetch (offline) can be retried
      throw e;
    },
  );
  return client;
}

/** The client if it has loaded, else null (no load is started). */
export const loadedSupabase = (): SupabaseClient | null => loaded;

/** Run `cb` once the client exists (now, if it already does). Returns an unsubscribe. */
export function onSupabaseLoaded(cb: (c: SupabaseClient) => void): () => void {
  if (loaded) {
    cb(loaded);
    return () => {};
  }
  listeners.add(cb);
  return () => listeners.delete(cb);
}
