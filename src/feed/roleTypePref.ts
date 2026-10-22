// "Show engineering-heavy roles" (Live postings → Calibrate), per track: a device UI pref
// (`rjb_ui_eng_roles`, { categoryId: true }), so it stays local like the other `rjb_ui_*` keys.
// Off by default: a design-systems track folds its engineering-heavy roles (feed/roleType.ts).
import { useMemo } from 'react';
import { liveStorage } from '../liveStorage';
import { loadPersisted, savePersisted } from '../persisted';
import { isDesignSystemsTrack } from './roleType';

export const ENG_ROLES_KEY = 'rjb_ui_eng_roles';
const live = liveStorage(ENG_ROLES_KEY);

const sanitize = (raw: unknown): Record<string, true> => {
  const out: Record<string, true> = {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out;
  for (const [id, v] of Object.entries(raw)) if (v === true) out[id] = true;
  return out;
};

export const readShowEngineering = (categoryId: string): boolean =>
  sanitize(loadPersisted<unknown>(ENG_ROLES_KEY, {}))[categoryId] === true;

export function writeShowEngineering(categoryId: string, on: boolean): void {
  const all = sanitize(loadPersisted<unknown>(ENG_ROLES_KEY, {}));
  if (on) all[categoryId] = true;
  else delete all[categoryId];
  savePersisted(ENG_ROLES_KEY, all);
  live.notify();
}

export function useShowEngineering(categoryId: string): boolean {
  const raw = live.useRaw();
  return useMemo(() => {
    try {
      return sanitize(raw ? JSON.parse(raw) : {})[categoryId] === true;
    } catch {
      return false;
    }
  }, [raw, categoryId]);
}

/** How a track treats role types: `ranked` orders design systems first and tags each role;
 *  `fold` also tucks the engineering-heavy ones away (unless the user shows them). */
export function useRoleTypes(
  categoryId: string,
  terms: string[],
): { ranked: boolean; fold: boolean } {
  const show = useShowEngineering(categoryId);
  const key = terms.join('\n');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ranked = useMemo(() => isDesignSystemsTrack(terms), [key]);
  return { ranked, fold: ranked && !show };
}
