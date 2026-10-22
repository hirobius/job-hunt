// A hand-off for "Find more like this" (issue #57): a Queue job seeds a title, then navigates to
// Discover, which consumes the seed to pre-fill its ATS search. Kept as a tiny module-global (not
// the URL hash) because it's transient and shouldn't survive a refresh or land in a shareable link.
// Once taken, it stays with the search it was handed to (its `?from=` origin, return paths): coming
// back to that search shows the same title, and no other search does.
import { recall, remember } from './viewMemory';

let seed: string | null = null;

/** Stash a title to pre-fill Discover's Title-search on its next mount. */
export function setDiscoverSeed(title: string): void {
  seed = title.trim() || null;
}

/** Read and clear the pending seed (returns null if none). */
export function consumeDiscoverSeed(): string | null {
  const s = seed;
  seed = null;
  return s;
}

/** The seed for the search opened from `from` (the origin's hash path; null for none): a pending
 *  seed is taken and kept for it, else the one kept for it before. */
export function seedFor(from: string | null): string | null {
  const key = `ats-seed:${from ?? ''}`;
  const fresh = consumeDiscoverSeed();
  if (fresh) remember(key, fresh);
  return fresh ?? recall<string>(key) ?? null;
}
