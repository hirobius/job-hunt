// A new user's auto profile and starter companies (searchDefaults.ts `ensureProfile`) are not the
// person's data: a sign-in drops them before the merge guard counts anything, so the account's own
// profile (or its v11 move) wins and nobody is asked to "add" defaults. With no profile after the
// pull, `ensureProfile` makes it again. Kept apart from searchDefaults.ts so the account seam does
// not load the starter company list (entryChunk.test.ts).
import { getProfiles, replaceProfiles } from './profile';
import { getSources, replaceSources } from './sources';
import type { Source } from './sourcesModel';

/** An auto Source the person has not touched (a star or a mute is theirs). */
export const untouchedAuto = (s: Source) => !!s.auto && !s.star && !s.muted;

/** Drop the untouched auto profile and starter companies from this device. */
export function dropAutoSetup(): void {
  const profiles = getProfiles();
  if (profiles.some((p) => p.auto)) replaceProfiles(profiles.filter((p) => !p.auto));
  const sources = getSources();
  const keep = sources.filter((s) => !untouchedAuto(s));
  if (keep.length !== sources.length) replaceSources(keep);
}
