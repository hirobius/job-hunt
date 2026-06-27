// Active-pillar state + the user-pillar registry. A small external store (mirrors
// src/store.ts). Built-in pillars are read-only; user pillars are created/edited here,
// persisted to localStorage via persisted<T>. The whole list (built-ins + user) and the
// active selection live in one immutable State object so useSyncExternalStore re-renders
// on any change. Cloud sync of user pillars is a later chunk.
import { useSyncExternalStore } from 'react';
import { BUILTIN_PILLARS, type Pillar } from './pillars';
import { loadPersisted, savePersisted } from './persisted';

const PILLARS_KEY = 'rjb_pillars';
const ACTIVE_KEY = 'rjb_active_pillar';

const newPillarId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : 'p-' + Math.random().toString(36).slice(2) + Date.now().toString(36);

type State = { activeId: string; pillars: Pillar[] };

function loadActiveId(pillars: Pillar[]): string {
  try {
    const stored = localStorage.getItem(ACTIVE_KEY);
    if (stored && pillars.some((p) => p.id === stored)) return stored;
  } catch {
    /* ignore */
  }
  return BUILTIN_PILLARS[0].id;
}

function initialState(): State {
  const user = loadPersisted<Pillar[]>(PILLARS_KEY, []).map((p) => ({ ...p, builtIn: false }));
  const pillars = [...BUILTIN_PILLARS, ...user];
  return { activeId: loadActiveId(pillars), pillars };
}

let state: State = initialState();
const listeners = new Set<() => void>();

function setState(next: State) {
  state = next;
  listeners.forEach((l) => l());
}
function persistUser(pillars: Pillar[]) {
  savePersisted(
    PILLARS_KEY,
    pillars.filter((p) => !p.builtIn),
  );
}
function persistActive(id: string) {
  try {
    localStorage.setItem(ACTIVE_KEY, id);
  } catch {
    /* ignore */
  }
}

export function setActivePillar(id: string) {
  if (id === state.activeId || !state.pillars.some((p) => p.id === id)) return;
  persistActive(id);
  setState({ ...state, activeId: id });
}

/** Create a user pillar (blank or seeded); makes it active. Returns its id. */
export function createPillar(partial?: Partial<Pillar>): string {
  const p: Pillar = {
    id: newPillarId(),
    label: 'New pillar',
    titles: [],
    atsRoles: [],
    seniority: 'any',
    location: 'Remote',
    groups: [],
    ...partial,
    builtIn: false,
  };
  const pillars = [...state.pillars, p];
  persistUser(pillars);
  persistActive(p.id);
  setState({ pillars, activeId: p.id });
  return p.id;
}

/** Duplicate any pillar (built-in or user) into an editable user pillar. Returns its id. */
export function duplicatePillar(id: string): string {
  const src = state.pillars.find((p) => p.id === id);
  if (!src) return state.activeId;
  return createPillar({
    label: `${src.label} (copy)`,
    titles: [...src.titles],
    atsRoles: [...src.atsRoles],
    seniority: src.seniority,
    location: src.location,
    tailorRole: src.tailorRole,
    groups: src.groups,
  });
}

/** Patch a user pillar. Built-ins are read-only and ignored. id/builtIn are protected. */
export function updatePillar(id: string, patch: Partial<Pillar>) {
  const pillars = state.pillars.map((p) =>
    p.id === id && !p.builtIn ? { ...p, ...patch, id: p.id, builtIn: false } : p,
  );
  persistUser(pillars);
  setState({ ...state, pillars });
}

/** Remove a user pillar (built-ins ignored). Falls back to a built-in if it was active. */
export function removePillar(id: string) {
  const target = state.pillars.find((p) => p.id === id);
  if (!target || target.builtIn) return;
  const pillars = state.pillars.filter((p) => p.id !== id);
  const activeId = state.activeId === id ? BUILTIN_PILLARS[0].id : state.activeId;
  persistUser(pillars);
  if (activeId !== state.activeId) persistActive(activeId);
  setState({ pillars, activeId });
}

// ---- reads ----
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
function getSnapshot() {
  return state;
}
function useStore(): State {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function usePillars(): Pillar[] {
  return useStore().pillars;
}
export function useActivePillarId(): string {
  return useStore().activeId;
}
export function useActivePillar(): Pillar {
  const s = useStore();
  return s.pillars.find((p) => p.id === s.activeId) ?? s.pillars[0];
}

// Non-hook getters for tests and non-component callers.
export function getPillars(): Pillar[] {
  return state.pillars;
}
export function getActivePillarId(): string {
  return state.activeId;
}
