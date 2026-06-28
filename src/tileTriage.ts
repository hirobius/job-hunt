// Board-level triage for Discover / Apprenticeship tiles. Two lightweight states keyed by
// tile URL: PIN (float to the top of its group) and SET ASIDE (drop out of the group into a
// collapsible "set aside" section), so you can comb through a long board and keep track of
// what you've already processed. A small external store mirroring src/store.ts. Persisted
// per-device via persisted<T>; not cloud-synced yet (triage is device-local for now).
import { useSyncExternalStore } from 'react';
import { loadPersisted, savePersisted } from './persisted';

const PINNED_KEY = 'rjb_tile_pinned';
const DISMISSED_KEY = 'rjb_tile_dismissed';

type State = { pinned: string[]; dismissed: string[] };

let state: State = {
  pinned: loadPersisted<string[]>(PINNED_KEY, []),
  dismissed: loadPersisted<string[]>(DISMISSED_KEY, []),
};
const listeners = new Set<() => void>();

function setState(next: State) {
  state = next;
  savePersisted(PINNED_KEY, next.pinned);
  savePersisted(DISMISSED_KEY, next.dismissed);
  listeners.forEach((l) => l());
}

const toggle = (list: string[], url: string) =>
  list.includes(url) ? list.filter((u) => u !== url) : [...list, url];

/** Pin / unpin a tile. Pinning a set-aside tile also brings it back into view. */
export function togglePin(url: string) {
  setState({
    pinned: toggle(state.pinned, url),
    dismissed: state.dismissed.filter((u) => u !== url),
  });
}

/** Set aside / restore a tile. Setting aside also clears any pin (mutually exclusive). */
export function toggleDismiss(url: string) {
  setState({
    dismissed: toggle(state.dismissed, url),
    pinned: state.pinned.filter((u) => u !== url),
  });
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
function getSnapshot() {
  return state;
}

export function useTileTriage(): State {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

// Non-hook getter for tests / non-component callers.
export function getTileTriage(): State {
  return state;
}
