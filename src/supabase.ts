// The app's ONE Supabase client (anon key, RLS-scoped). CloudSync (tracker blob + auth) and the
// curation store/sync (categories/groups/tiles) both import it — two clients meant two GoTrue
// instances fighting over the same persisted session (#99).
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
