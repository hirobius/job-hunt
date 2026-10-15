// The track context every Discover search shares: where you want to work and in which mode.
// Location is the Category's own `location` (so Manage track edits the same value); work mode is a
// per-device preference, `rjb_ui_mode:<categoryId>` (spec: docs/specs/discover.md, Slice 1).
import { useSyncExternalStore } from 'react';
import { updateCategory, useCategories } from './curation/curationStore';
import type { WorkMode } from './jobsData';

export const MODES: readonly WorkMode[] = ['any', 'remote', 'hybrid', 'onsite'];
export const modeKey = (categoryId: string) => `rjb_ui_mode:${categoryId}`;

const MODE_LABEL: Record<WorkMode, string> = {
  any: 'Any mode',
  remote: 'Remote',
  hybrid: 'Hybrid',
  onsite: 'On-site',
};

// Only used when storage is blocked, so the choice still holds for the session.
const memory = new Map<string, WorkMode>();
const listeners = new Set<() => void>();

const isMode = (v: unknown): v is WorkMode => MODES.includes(v as WorkMode);

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
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/** "Spokane, Hybrid" · "Anywhere, Any mode" · "Remote". */
export function contextLabel(where: string, mode: WorkMode): string {
  if (mode === 'remote') return 'Remote';
  return `${where.trim() || 'Anywhere'}, ${MODE_LABEL[mode]}`;
}

/** Set the track's location and/or work mode from outside a component (e.g. applying a saved search). */
export function setTrackContext(
  categoryId: string,
  patch: { where?: string; mode?: WorkMode },
): void {
  if (patch.where !== undefined) updateCategory(categoryId, { location: patch.where });
  if (patch.mode !== undefined) writeMode(categoryId, patch.mode);
}

export interface TrackContext {
  where: string;
  mode: WorkMode;
  setWhere: (v: string) => void;
  setMode: (v: WorkMode) => void;
}

export function useTrackContext(categoryId: string): TrackContext {
  const where = useCategories().find((c) => c.id === categoryId)?.location ?? '';
  const mode = useSyncExternalStore(
    subscribe,
    () => readMode(categoryId),
    () => 'any' as WorkMode,
  );
  return {
    where,
    mode,
    setWhere: (v) => setTrackContext(categoryId, { where: v }),
    setMode: (v) => setTrackContext(categoryId, { mode: v }),
  };
}
