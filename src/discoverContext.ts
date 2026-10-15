// The track context every Discover search shares: where you want to work and in which mode.
// Location is the Category's own `location` (so Manage track edits the same value); work mode is a
// per-track preference that follows the account (ADR 0008), `rjb_ui_mode:<categoryId>` (spec: docs/specs/discover.md, Slice 1).
import { updateCategory, useCategories } from './curation/curationStore';
import type { WorkMode } from './jobsData';
import { useMode, writeMode } from './trackModes';

export { MODES, modeKey, readMode, writeMode } from './trackModes';

const MODE_LABEL: Record<WorkMode, string> = {
  any: 'Any mode',
  remote: 'Remote',
  hybrid: 'Hybrid',
  onsite: 'On-site',
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
  const mode = useMode(categoryId);
  return {
    where,
    mode,
    setWhere: (v) => setTrackContext(categoryId, { where: v }),
    setMode: (v) => setTrackContext(categoryId, { mode: v }),
  };
}
