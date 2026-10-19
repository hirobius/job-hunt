// Outreach targets (method 3): companies worth writing to, with or without an opening. A saved
// company entry, not a Job (docs/specs/discovery-methods.md): it lives in local storage per track
// (`rjb_targets`) and syncs with the account in the blob (ADR 0008). Storage is untrusted.
import { useMemo, useSyncExternalStore } from 'react';
import { mergeByKey } from '../mergeByKey';
import { loadPersisted, savePersisted } from '../persisted';
import { PROBE_KINDS } from './probe';
import type { Board } from './sources/ats';

export const TARGETS_KEY = 'rjb_targets';
export const MAX_TARGETS_PER_TRACK = 500;

export interface Target {
  login: string;
  company: string;
  website?: string;
  /** The org's design-system repo; absent on a target seeded from a starter pack (#198). */
  repo?: string;
  repoUrl?: string;
  stars?: number;
  board?: Board;
  openRoles?: number;
  /** ISO time of the first save. */
  savedAt: string;
}

const SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const httpUrl = (v: unknown): string | undefined => {
  if (typeof v !== 'string') return undefined;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' || u.protocol === 'http:' ? v : undefined;
  } catch {
    return undefined;
  }
};

function sanitizeOne(raw: unknown): Target | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const login = typeof o.login === 'string' ? o.login.trim() : '';
  const repo = typeof o.repo === 'string' && o.repo ? o.repo : undefined;
  if (!login) return null;
  const b =
    typeof o.board === 'object' && o.board !== null ? (o.board as Record<string, unknown>) : null;
  const board: Board | undefined =
    b &&
    PROBE_KINDS.includes(b.kind as Board['kind']) &&
    typeof b.slug === 'string' &&
    SLUG.test(b.slug)
      ? { kind: b.kind as Board['kind'], slug: b.slug, ...(b.eu === true && { eu: true as const }) }
      : undefined;
  // A target is a GitHub org with its repo, or a company with a known board (a starter pack's).
  if (!repo && !board) return null;
  return {
    login,
    company: typeof o.company === 'string' && o.company.trim() ? o.company : login,
    website: httpUrl(o.website),
    repo,
    repoUrl: repo ? (httpUrl(o.repoUrl) ?? `https://github.com/${repo}`) : undefined,
    stars: !repo ? undefined : typeof o.stars === 'number' && o.stars >= 0 ? o.stars : 0,
    board,
    openRoles: typeof o.openRoles === 'number' && o.openRoles >= 0 ? o.openRoles : undefined,
    savedAt: typeof o.savedAt === 'string' ? o.savedAt : new Date(0).toISOString(),
  };
}

export function sanitizeTargets(raw: unknown): Record<string, Target[]> {
  const out: Record<string, Target[]> = {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out;
  for (const [track, list] of Object.entries(raw)) {
    if (!Array.isArray(list)) continue;
    const ok = list.map(sanitizeOne).filter((x): x is Target => !!x);
    if (ok.length) out[track] = ok.slice(-MAX_TARGETS_PER_TRACK);
  }
  return out;
}

const readAll = () => sanitizeTargets(loadPersisted<unknown>(TARGETS_KEY, {}));
const listeners = new Set<() => void>();
const write = (all: Record<string, Target[]>) => {
  savePersisted(TARGETS_KEY, all);
  listeners.forEach((l) => l());
};

/** Every track's targets (for the sync blob and backup). */
export const getAllTargets = readAll;

/** Replace the whole store (a pull, a restore) and notify subscribers. */
export function replaceTargets(all: Record<string, Target[]>): void {
  write(sanitizeTargets(all));
}

/** Union by organisation login (ignoring case) per track; `cloud` wins on a shared login, local-only
 *  entries are kept, and a track's list is capped at its newest MAX_TARGETS_PER_TRACK. */
export function mergeTargets(
  cloud: Record<string, Target[]>,
  local: Record<string, Target[]>,
): Record<string, Target[]> {
  const out: Record<string, Target[]> = {};
  for (const track of new Set([...Object.keys(local), ...Object.keys(cloud)])) {
    const merged = mergeByKey<Target>(
      (t) => t.login.toLowerCase(),
      cloud[track] ?? [],
      local[track] ?? [],
    );
    if (merged.length) out[track] = merged.slice(-MAX_TARGETS_PER_TRACK);
  }
  return out;
}

export const readTargets = (categoryId: string): Target[] => readAll()[categoryId] ?? [];

/** Save (or refresh) an organisation as a target on a track. Returns the track's list. */
export function saveTarget(categoryId: string, t: Omit<Target, 'savedAt'>): Target[] {
  const all = readAll();
  const list = [...(all[categoryId] ?? [])];
  const at = list.findIndex((x) => x.login.toLowerCase() === t.login.toLowerCase());
  if (at >= 0) list[at] = { ...t, savedAt: list[at].savedAt };
  else list.push({ ...t, savedAt: new Date().toISOString() });
  all[categoryId] = list.slice(-MAX_TARGETS_PER_TRACK);
  write(all);
  return all[categoryId];
}

/** Add the targets a track lacks (by login, ignoring case), leaving its own untouched, in one write.
 *  Returns how many were added. A starter pack's companies arrive this way (#198). */
export function addTargets(categoryId: string, ts: readonly Omit<Target, 'savedAt'>[]): number {
  const all = readAll();
  const list = [...(all[categoryId] ?? [])];
  const have = new Set(list.map((x) => x.login.toLowerCase()));
  const savedAt = new Date().toISOString();
  const fresh = ts.filter((t) => {
    const k = t.login.toLowerCase();
    if (have.has(k)) return false;
    have.add(k);
    return true;
  });
  if (fresh.length === 0) return 0;
  all[categoryId] = [...list, ...fresh.map((t) => ({ ...t, savedAt }))].slice(
    -MAX_TARGETS_PER_TRACK,
  );
  write(all);
  return fresh.length;
}

export function removeTarget(categoryId: string, login: string): Target[] {
  const all = readAll();
  const list = (all[categoryId] ?? []).filter((x) => x.login.toLowerCase() !== login.toLowerCase());
  if (list.length) all[categoryId] = list;
  else delete all[categoryId];
  write(all);
  return list;
}

// The snapshot is the raw stored string: stable between changes, so nothing here caches state that
// a test (or another tab) could change under it.
const rawNow = () => {
  try {
    return localStorage.getItem(TARGETS_KEY) ?? '';
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

/** A track's saved targets, live. */
export function useTargets(categoryId: string): Target[] {
  const raw = useSyncExternalStore(subscribe, rawNow, rawNow);
  return useMemo(() => {
    try {
      return sanitizeTargets(raw ? JSON.parse(raw) : {})[categoryId] ?? [];
    } catch {
      return [];
    }
  }, [raw, categoryId]);
}

/** Every track's targets, live (the sync provider pushes when this changes). */
export function useAllTargets(): Record<string, Target[]> {
  const raw = useSyncExternalStore(subscribe, rawNow, rawNow);
  return useMemo(() => {
    try {
      return sanitizeTargets(raw ? JSON.parse(raw) : {});
    } catch {
      return {};
    }
  }, [raw]);
}
