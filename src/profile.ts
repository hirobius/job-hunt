// The Search profile (blob v12, simplify spec): what the Feed looks for, in place of tracks. One
// entry today, stored as `profiles[]` so a second one never needs a new blob version. It holds the
// titles (the wide sweep runs over every title that is on, no cap of 12), the ATS roles, must
// include with its related titles, leave out, pay floor, level, location and work mode. A profile
// with `scorer` uses that tuned config (src/tracks) instead of the phrase rules, Review included.
// Kept in `rjb_profiles`, synced in the blob. Storage and the cloud are untrusted.
// The pure half (types, sanitizers, merge) is profileModel.ts; this is the store.
import { useMemo } from 'react';
import { liveStorage } from './liveStorage';
import { loadPersisted, savePersisted } from './persisted';
import { sanitizeProfile, sanitizeProfiles, type Profile } from './profileModel';

export * from './profileModel';

export const PROFILES_KEY = 'rjb_profiles';

const readAll = () => sanitizeProfiles(loadPersisted<unknown>(PROFILES_KEY, []));
const live = liveStorage(PROFILES_KEY);
const write = (all: Profile[]) => {
  savePersisted(PROFILES_KEY, all);
  live.notify();
};

/** Every profile (for the sync blob and backup). */
export const getProfiles = readAll;

/** The profile in use, or null before the v11 move / onboarding made one. */
export const getProfile = (): Profile | null => readAll()[0] ?? null;

/** Replace the whole list (a pull, a restore) and notify subscribers. */
export function replaceProfiles(all: Profile[]): void {
  write(sanitizeProfiles(all));
}

/** Make (or replace) the profile in use: onboarding's Search profile form. Any other profile is
 *  kept behind it. Returns the profile written. */
export function saveProfile(
  fields: Partial<Omit<Profile, 'id' | 'createdAt'>> & Pick<Profile, 'titles'>,
): Profile | null {
  const all = readAll();
  const cur = all[0];
  const next = sanitizeProfile({
    ...cur,
    ...fields,
    id: cur?.id ?? `profile-${Date.now().toString(36)}`,
    createdAt: cur?.createdAt ?? new Date().toISOString(),
  });
  if (!next) return null;
  write([next, ...all.slice(1)]);
  return next;
}

/** Change the profile in use (merged over what it has). No profile yet: nothing happens. */
export function updateProfile(change: Partial<Omit<Profile, 'id' | 'createdAt'>>): boolean {
  const all = readAll();
  if (!all.length) return false;
  const next = sanitizeProfile({ ...all[0], ...change });
  if (!next) return false;
  all[0] = next;
  write(all);
  return true;
}

/** Every profile, live. */
export function useProfiles(): Profile[] {
  const raw = live.useRaw();
  return useMemo(() => {
    try {
      return sanitizeProfiles(raw ? JSON.parse(raw) : []);
    } catch {
      return [];
    }
  }, [raw]);
}

/** The profile in use, live; null before one exists. */
export function useProfile(): Profile | null {
  return useProfiles()[0] ?? null;
}
