// Work mode per track (`rjb_ui_mode:<categoryId>`): any / remote / hybrid / on-site. It follows the
// account (ADR 0008), so the sync blob carries a { categoryId: mode } map. This module is the store
// and stays free of the curation layer so the blob module can import its merge.
import { useMemo, useSyncExternalStore } from 'react';
import type { WorkMode } from './jobsData';

export const MODES: readonly WorkMode[] = ['any', 'remote', 'hybrid', 'onsite'];
const PREFIX = 'rjb_ui_mode:';
export const modeKey = (categoryId: string) => `${PREFIX}${categoryId}`;

// Only used when storage is blocked, so the choice still holds for the session.
const memory = new Map<string, WorkMode>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

const isMode = (v: unknown): v is WorkMode => MODES.includes(v as WorkMode);
const UNSAFE = ['__proto__', 'constructor', 'prototype'];

export function readMode(categoryId: string): WorkMode {
  try {
    const v = localStorage.getItem(modeKey(categoryId));
    if (isMode(v)) return v;
  } catch {
    /* blocked storage: fall through to memory */
  }
  return memory.get(categoryId) ?? 'any';
}

export function writeMode(categoryId: string, mode: WorkMode): void {
  memory.set(categoryId, mode);
  try {
    localStorage.setItem(modeKey(categoryId), mode);
    memory.delete(categoryId);
  } catch {
    /* kept in memory */
  }
  notify();
}

/** Keep only well-formed { categoryId: mode } pairs. */
export function sanitizeModes(raw: unknown): Record<string, WorkMode> {
  const out: Record<string, WorkMode> = {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out;
  for (const [id, m] of Object.entries(raw)) {
    if (id && !UNSAFE.includes(id) && isMode(m)) out[id] = m;
  }
  return out;
}

/** Every track's explicitly chosen mode, keys sorted so the JSON is stable. */
export function getAllModes(): Record<string, WorkMode> {
  const out: Record<string, WorkMode> = {};
  try {
    for (const k of Object.keys(localStorage).sort()) {
      if (!k.startsWith(PREFIX)) continue;
      const v = localStorage.getItem(k);
      if (isMode(v)) out[k.slice(PREFIX.length)] = v;
    }
  } catch {
    /* blocked storage: memory only */
  }
  for (const [id, m] of [...memory].sort(([a], [b]) => (a < b ? -1 : 1))) out[id] ??= m;
  return out;
}

/** Replace every track's mode (a pull, a restore) and notify subscribers. */
export function replaceModes(all: Record<string, WorkMode>): void {
  const next = sanitizeModes(all);
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .forEach((k) => localStorage.removeItem(k));
    for (const [id, m] of Object.entries(next)) localStorage.setItem(modeKey(id), m);
    memory.clear();
  } catch {
    memory.clear();
    for (const [id, m] of Object.entries(next)) memory.set(id, m);
  }
  notify();
}

/** Union by track; `cloud` wins on a track both have, local-only tracks are kept. */
export function mergeModes(
  cloud: Record<string, WorkMode>,
  local: Record<string, WorkMode>,
): Record<string, WorkMode> {
  return { ...local, ...cloud };
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/** A track's work mode, live. */
export const useMode = (categoryId: string): WorkMode =>
  useSyncExternalStore(
    subscribe,
    () => readMode(categoryId),
    () => 'any' as WorkMode,
  );

/** Every track's mode, live (the sync provider pushes when this changes). */
export function useAllModes(): Record<string, WorkMode> {
  const snap = useSyncExternalStore(
    subscribe,
    () => JSON.stringify(getAllModes()),
    () => '{}',
  );
  return useMemo(() => JSON.parse(snap) as Record<string, WorkMode>, [snap]);
}
