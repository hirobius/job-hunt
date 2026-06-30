// Board-level triage for Discover / Apprenticeship tiles. Two lightweight states keyed by
// tile URL: PIN (float to the top of its group) and SET ASIDE (drop out of the group into a
// collapsible "set aside" section), so you can comb through a long board and keep track of
// what you've already processed. Built on the shared createStore factory; persisted per-device
// (two keys), not cloud-synced yet (triage is device-local for now).
import { createStore } from './createStore';
import { loadPersisted, savePersisted } from './persisted';

const PINNED_KEY = 'rjb_tile_pinned';
const DISMISSED_KEY = 'rjb_tile_dismissed';

type State = { pinned: string[]; dismissed: string[] };

const store = createStore<State>(
  {
    pinned: loadPersisted<string[]>(PINNED_KEY, []),
    dismissed: loadPersisted<string[]>(DISMISSED_KEY, []),
  },
  {
    onSet: (next) => {
      savePersisted(PINNED_KEY, next.pinned);
      savePersisted(DISMISSED_KEY, next.dismissed);
    },
  },
);

const toggle = (list: string[], url: string) =>
  list.includes(url) ? list.filter((u) => u !== url) : [...list, url];

/** Pin / unpin a tile. Pinning a set-aside tile also brings it back into view. */
export function togglePin(url: string) {
  const s = store.get();
  store.set({
    pinned: toggle(s.pinned, url),
    dismissed: s.dismissed.filter((u) => u !== url),
  });
}

/** Set aside / restore a tile. Setting aside also clears any pin (mutually exclusive). */
export function toggleDismiss(url: string) {
  const s = store.get();
  store.set({
    dismissed: toggle(s.dismissed, url),
    pinned: s.pinned.filter((u) => u !== url),
  });
}

/** Replace the whole triage state (cloud sync). Missing arrays default to empty. */
export function replaceTriage(next: { pinned?: string[]; dismissed?: string[] }) {
  store.set({
    pinned: Array.isArray(next.pinned) ? next.pinned : [],
    dismissed: Array.isArray(next.dismissed) ? next.dismissed : [],
  });
}

export function useTileTriage(): State {
  return store.use();
}

// Non-hook getter for tests / non-component callers.
export function getTileTriage(): State {
  return store.get();
}
