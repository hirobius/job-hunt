// Active-pillar state + the user-pillar registry. Built on the shared createStore factory
// (src/createStore.ts). Built-in pillars are read-only; user pillars are created/edited here,
// persisted to localStorage via persisted<T>. Persistence here is bespoke (a projection — only
// user pillars under PILLARS_KEY — plus a separate ACTIVE_KEY scalar), so it stays explicit in
// the mutators rather than going through the factory's onSet. Cloud sync of user pillars is a
// later chunk.
import { createStore } from './createStore';
import { mergeByKey } from './mergeByKey';
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

const store = createStore<State>(initialState());

function setState(next: State) {
  store.set(next);
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
  const state = store.get();
  if (id === state.activeId || !state.pillars.some((p) => p.id === id)) return;
  persistActive(id);
  setState({ ...state, activeId: id });
}

/** Create a user pillar (blank or seeded); makes it active. Returns its id. */
export function createPillar(partial?: Partial<Pillar>): string {
  const state = store.get();
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
  const state = store.get();
  const src = state.pillars.find((p) => p.id === id);
  if (!src) return state.activeId;
  return createPillar({
    label: `${src.label} (copy)`,
    titles: [...src.titles],
    atsRoles: [...src.atsRoles],
    seniority: src.seniority,
    location: src.location,
    groups: src.groups,
  });
}

/** Patch a user pillar. Built-ins are read-only and ignored. id/builtIn are protected. */
export function updatePillar(id: string, patch: Partial<Pillar>) {
  const state = store.get();
  const pillars = state.pillars.map((p) =>
    p.id === id && !p.builtIn ? { ...p, ...patch, id: p.id, builtIn: false } : p,
  );
  persistUser(pillars);
  setState({ ...state, pillars });
}

/** Remove a user pillar (built-ins ignored). Falls back to a built-in if it was active. */
export function removePillar(id: string) {
  const state = store.get();
  const target = state.pillars.find((p) => p.id === id);
  if (!target || target.builtIn) return;
  const pillars = state.pillars.filter((p) => p.id !== id);
  const activeId = state.activeId === id ? BUILTIN_PILLARS[0].id : state.activeId;
  persistUser(pillars);
  if (activeId !== state.activeId) persistActive(activeId);
  setState({ pillars, activeId });
}

/** All user-created pillars (excludes built-ins). Used by cloud sync. */
export function getUserPillars(): Pillar[] {
  return store.get().pillars.filter((p) => !p.builtIn);
}

/** Replace the whole set of user pillars (cloud sync). Active falls back if it vanished. */
export function replaceUserPillars(list: Pillar[]) {
  const state = store.get();
  const user = list.filter((p) => p && p.id && !p.builtIn).map((p) => ({ ...p, builtIn: false }));
  const pillars = [...BUILTIN_PILLARS, ...user];
  const activeId = pillars.some((p) => p.id === state.activeId)
    ? state.activeId
    : BUILTIN_PILLARS[0].id;
  persistUser(pillars);
  if (activeId !== state.activeId) persistActive(activeId);
  setState({ pillars, activeId });
}

/** Merge cloud + local user pillars by id (local order kept, cloud wins). For the sync layer. */
export const mergePillars = (cloud: Pillar[] | null, local: Pillar[]): Pillar[] =>
  mergeByKey((p) => p.id, cloud, local);

// ---- reads ----
function useStore(): State {
  return store.use();
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
  return store.get().pillars;
}
export function getActivePillarId(): string {
  return store.get().activeId;
}
