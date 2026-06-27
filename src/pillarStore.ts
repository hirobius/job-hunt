// Active-pillar state — which career pillar Discover (and later Copy Deck + AI) is
// currently scoped to. A small external store mirroring src/store.ts. The selection
// persists to localStorage. Chunk 2 will merge user-created pillars into the list and
// move persistence behind the shared persisted<T> module.
import { useSyncExternalStore } from 'react';
import { BUILTIN_PILLARS, type Pillar } from './pillars';

const KEY = 'rjb_active_pillar';

function loadActiveId(): string {
  try {
    const id = localStorage.getItem(KEY);
    if (id && BUILTIN_PILLARS.some((p) => p.id === id)) return id;
  } catch {
    /* ignore */
  }
  return BUILTIN_PILLARS[0].id;
}

let activeId = loadActiveId();
const listeners = new Set<() => void>();

export function setActivePillar(id: string) {
  if (id === activeId || !BUILTIN_PILLARS.some((p) => p.id === id)) return;
  activeId = id;
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
function snapshot() {
  return activeId;
}

export function useActivePillarId(): string {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export function useActivePillar(): Pillar {
  const id = useActivePillarId();
  return BUILTIN_PILLARS.find((p) => p.id === id) ?? BUILTIN_PILLARS[0];
}

/** The list of selectable pillars (built-ins for now; user pillars join in Chunk 2). */
export function usePillars(): Pillar[] {
  return BUILTIN_PILLARS;
}
