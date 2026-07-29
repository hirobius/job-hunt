// A one-shot hand-off for "Find more like this" (issue #57): a Queue job seeds a title, then
// navigates to Discover, which consumes the seed once to pre-fill its Title-search term. Kept
// as a tiny module-global (not the URL hash) because it's transient, single-use, and shouldn't
// survive a refresh or land in a shareable link.
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
