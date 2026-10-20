// Board-level triage for Discover tiles: SET ASIDE drops a tile out of its group into a
// collapsible "set aside" section, so you can comb through a long board and keep track of what
// you've already processed. Keyed by tile URL, persisted per device and synced in the blob. The
// old PIN state is gone (#19; its UI went in #13): any pin data left in storage, a cloud blob or
// a backup is ignored, and this device's retired key is removed on load.
import { createStore } from './createStore';
import { loadPersisted, savePersisted } from './persisted';

const DISMISSED_KEY = 'rjb_tile_dismissed';
const RETIRED_PINNED_KEY = 'rjb_tile_pinned';

export type Triage = { dismissed: string[] };

try {
  localStorage.removeItem(RETIRED_PINNED_KEY);
} catch {
  /* storage unavailable */
}

const store = createStore<Triage>(
  { dismissed: loadPersisted<string[]>(DISMISSED_KEY, []) },
  { onSet: (next) => savePersisted(DISMISSED_KEY, next.dismissed) },
);

/** Set aside / restore a tile. */
export function toggleDismiss(url: string) {
  const { dismissed } = store.get();
  store.set({
    dismissed: dismissed.includes(url) ? dismissed.filter((u) => u !== url) : [...dismissed, url],
  });
}

/** Replace the whole triage state (cloud sync, restore). A missing list defaults to empty. */
export function replaceTriage(next: { dismissed?: string[] }) {
  store.set({ dismissed: Array.isArray(next.dismissed) ? next.dismissed : [] });
}

export function useTileTriage(): Triage {
  return store.use();
}

// Non-hook getter for tests / non-component callers.
export function getTileTriage(): Triage {
  return store.get();
}

/** Merge cloud + local triage: a tile set aside on either side stays set aside. */
export function mergeTriage(cloud: Triage | null, local: Triage): Triage {
  return { dismissed: Array.from(new Set([...local.dismissed, ...(cloud?.dismissed ?? [])])) };
}
