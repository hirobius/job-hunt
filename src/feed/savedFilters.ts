// Saved searches: a named bundle of everything that narrows Live postings, kept per track in local
// storage (`rjb_feed_filters`) for one-tap recall. Syncs with the account in the blob (ADR 0008).
// Storage is untrusted: anything malformed reads as "none saved" rather than breaking the panel.
import type { WorkMode } from '../jobsData';
import type { Seniority } from '../curation/types';
import { useMemo, useSyncExternalStore } from 'react';
import { mergeByKey } from '../mergeByKey';
import { loadPersisted, savePersisted } from '../persisted';

export const FILTERS_KEY = 'rjb_feed_filters';
export const MAX_FILTERS_PER_TRACK = 12;

export interface SavedFilter {
  name: string;
  term: string;
  where: string;
  mode: WorkMode;
  exclude: string[];
  seniority: Seniority;
  salaryFloor?: number;
  salaryOnly: boolean;
  /** The "Contract-friendly" focus chip. */
  contractOnly: boolean;
}

const MODES: WorkMode[] = ['any', 'remote', 'hybrid', 'onsite'];
const SENIORITIES: Seniority[] = ['any', 'entry', 'experienced'];

function sanitizeOne(raw: unknown): SavedFilter | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const name = typeof o.name === 'string' ? o.name.trim() : '';
  if (!name) return null;
  const floor = typeof o.salaryFloor === 'number' && o.salaryFloor > 0 ? o.salaryFloor : undefined;
  return {
    name,
    term: typeof o.term === 'string' ? o.term : '',
    where: typeof o.where === 'string' ? o.where : '',
    mode: MODES.includes(o.mode as WorkMode) ? (o.mode as WorkMode) : 'any',
    exclude: Array.isArray(o.exclude)
      ? o.exclude.filter((x): x is string => typeof x === 'string' && x.trim() !== '')
      : [],
    seniority: SENIORITIES.includes(o.seniority as Seniority) ? (o.seniority as Seniority) : 'any',
    salaryFloor: floor,
    salaryOnly: o.salaryOnly === true,
    contractOnly: o.contractOnly === true,
  };
}

export function sanitizeFilters(raw: unknown): Record<string, SavedFilter[]> {
  const out: Record<string, SavedFilter[]> = {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out;
  for (const [track, list] of Object.entries(raw)) {
    if (!Array.isArray(list)) continue;
    const ok = list.map(sanitizeOne).filter((x): x is SavedFilter => !!x);
    if (ok.length) out[track] = ok.slice(-MAX_FILTERS_PER_TRACK);
  }
  return out;
}

const readAll = () => sanitizeFilters(loadPersisted<unknown>(FILTERS_KEY, {}));
const listeners = new Set<() => void>();
const write = (all: Record<string, SavedFilter[]>) => {
  savePersisted(FILTERS_KEY, all);
  listeners.forEach((l) => l());
};

/** Every track's saved searches (for the sync blob and backup). */
export const getAllFilters = readAll;

/** Replace the whole store (a pull, a restore) and notify subscribers. */
export function replaceFilters(all: Record<string, SavedFilter[]>): void {
  write(sanitizeFilters(all));
}

/** Union by name (ignoring case) per track; `cloud` wins on a shared name, local-only searches are
 *  kept, and a track's list is capped at its newest MAX_FILTERS_PER_TRACK. */
export function mergeFilters(
  cloud: Record<string, SavedFilter[]>,
  local: Record<string, SavedFilter[]>,
): Record<string, SavedFilter[]> {
  const out: Record<string, SavedFilter[]> = {};
  for (const track of new Set([...Object.keys(local), ...Object.keys(cloud)])) {
    const merged = mergeByKey<SavedFilter>(
      (f) => f.name.toLowerCase(),
      cloud[track] ?? [],
      local[track] ?? [],
    );
    if (merged.length) out[track] = merged.slice(-MAX_FILTERS_PER_TRACK);
  }
  return out;
}

export const readFilters = (categoryId: string): SavedFilter[] => readAll()[categoryId] ?? [];

/** Save (or replace, matching the name without case) a filter for a track. Returns the track's list. */
export function saveFilter(categoryId: string, filter: SavedFilter): SavedFilter[] {
  const name = filter.name.trim();
  const all = readAll();
  if (!name) return all[categoryId] ?? [];
  const list = [...(all[categoryId] ?? [])];
  const at = list.findIndex((x) => x.name.toLowerCase() === name.toLowerCase());
  const next = { ...filter, name };
  if (at >= 0) list[at] = next;
  else list.push(next);
  all[categoryId] = list.slice(-MAX_FILTERS_PER_TRACK);
  write(all);
  return all[categoryId];
}

export function deleteFilter(categoryId: string, name: string): SavedFilter[] {
  const all = readAll();
  const list = (all[categoryId] ?? []).filter((x) => x.name !== name);
  if (list.length) all[categoryId] = list;
  else delete all[categoryId];
  write(all);
  return list;
}

const rawNow = () => {
  try {
    return localStorage.getItem(FILTERS_KEY) ?? '';
  } catch {
    return '';
  }
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  window.addEventListener('storage', l);
  return () => {
    listeners.delete(l);
    window.removeEventListener('storage', l);
  };
};

/** Every track's saved searches, live. */
export function useAllFilters(): Record<string, SavedFilter[]> {
  const raw = useSyncExternalStore(subscribe, rawNow, rawNow);
  return useMemo(() => {
    try {
      return sanitizeFilters(raw ? JSON.parse(raw) : {});
    } catch {
      return {};
    }
  }, [raw]);
}

/** A track's saved searches, live. */
export function useFilters(categoryId: string): SavedFilter[] {
  return useAllFilters()[categoryId] ?? [];
}
