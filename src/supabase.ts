// The app's ONE Supabase client (anon key, RLS-scoped). CloudSync (tracker blob + auth) and the
// curation store/sync (categories/groups/tiles) both use it — two clients meant two GoTrue
// instances fighting over the same persisted session (#99).
//
// Loaded lazily: supabase-js is ~55 kB gzipped and a signed-out visitor never needs it. The client
// is built on first `loadSupabase()`, which CloudSync calls at boot only when a session is stored
// or a magic link has just returned (`needsClientAtBoot`), and otherwise on sign-in. A magic link's
// tokens never sign in from here: CloudSync checks them first (account/authLink.ts).
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config';
import { importFresh } from './staleBuild';
import { bootAuthTokens } from './authFragment';

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

/** Whether the client is needed right away: a stored session, or a magic link just returned. */
export function needsClientAtBoot(): boolean {
  return bootAuthTokens() !== null || hasPersistedSession();
}

let client: Promise<SupabaseClient> | null = null;
let loaded: SupabaseClient | null = null;
const listeners = new Set<(c: SupabaseClient) => void>();

/** The shared client, built on first call (the supabase-js chunk is fetched then). */
export function loadSupabase(): Promise<SupabaseClient> {
  client ??= importFresh(() => import('@supabase/supabase-js'))().then(
    ({ createClient }) => {
      // The implicit flow keeps a magic link working on another device (PKCE would need this
      // browser's verifier). supabase-js never reads the URL itself: authFragment.ts takes the
      // tokens and strips them, and the account seam decides whether they may sign in (authLink.ts).
      const c = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { flowType: 'implicit', detectSessionInUrl: false },
      });
      loaded = c;
      listeners.forEach((l) => l(c));
      listeners.clear();
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
