// Dream companies: companies the user always wants to see, open roles or not, starred from the
// Teams tool. Per track in local storage (`rjb_dreams`), synced with the
// account in the blob (v9, ADR 0008). Each keeps the posting ids seen at its last check, so "Check
// dream companies" can say what is new. Storage is untrusted.
import { useMemo, useSyncExternalStore } from 'react';
import { mergeByKey } from '../mergeByKey';
import { loadPersisted, savePersisted } from '../persisted';
import type { Board } from './sources/ats';
import { httpUrl, sanitizeBoard } from './targets';

export const DREAMS_KEY = 'rjb_dreams';
export const MAX_DREAMS_PER_TRACK = 100;
/** Posting ids kept per company: enough for a big board, small enough for the blob. */
export const MAX_SEEN = 300;

export interface Dream {
  /** The company name, lower-cased and trimmed: one entry per company per track. */
  key: string;
  company: string;
  website?: string;
  board?: Board;
  /** Posting ids at the last check. */
  seen: string[];
  /** ISO time of the last check; absent before the first. */
  checkedAt?: string;
  /** ISO time it was starred. */
  starredAt: string;
}

export const dreamKey = (company: string) => company.trim().toLowerCase();

function sanitizeOne(raw: unknown): Dream | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const company = typeof o.company === 'string' ? o.company.trim() : '';
  if (!company) return null;
  const seen = Array.isArray(o.seen)
    ? o.seen.filter((s): s is string => typeof s === 'string')
    : [];
  return {
    key: dreamKey(company),
    company,
    website: httpUrl(o.website),
    board: sanitizeBoard(o.board),
    seen: seen.slice(0, MAX_SEEN),
    checkedAt: typeof o.checkedAt === 'string' ? o.checkedAt : undefined,
    starredAt: typeof o.starredAt === 'string' ? o.starredAt : new Date(0).toISOString(),
  };
}

export function sanitizeDreams(raw: unknown): Record<string, Dream[]> {
  const out: Record<string, Dream[]> = {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out;
  for (const [track, list] of Object.entries(raw)) {
    if (!Array.isArray(list)) continue;
    const ok = mergeByKey<Dream>(
      (d) => d.key,
      null,
      list.map(sanitizeOne).filter((x): x is Dream => !!x),
    );
    if (ok.length) out[track] = ok.slice(-MAX_DREAMS_PER_TRACK);
  }
  return out;
}

const readAll = () => sanitizeDreams(loadPersisted<unknown>(DREAMS_KEY, {}));
const listeners = new Set<() => void>();
const write = (all: Record<string, Dream[]>) => {
  savePersisted(DREAMS_KEY, all);
  listeners.forEach((l) => l());
};

/** Every track's dream companies (for the sync blob and backup). */
export const getAllDreams = readAll;

/** Replace the whole store (a pull, a restore) and notify subscribers. */
export function replaceDreams(all: Record<string, Dream[]>): void {
  write(sanitizeDreams(all));
}

/** Union by company per track; `cloud` wins on a shared company, local-only entries are kept. */
export function mergeDreams(
  cloud: Record<string, Dream[]>,
  local: Record<string, Dream[]>,
): Record<string, Dream[]> {
  const out: Record<string, Dream[]> = {};
  for (const track of new Set([...Object.keys(local), ...Object.keys(cloud)])) {
    const merged = mergeByKey<Dream>((d) => d.key, cloud[track] ?? [], local[track] ?? []);
    if (merged.length) out[track] = merged.slice(-MAX_DREAMS_PER_TRACK);
  }
  return out;
}

export const readDreams = (categoryId: string): Dream[] => readAll()[categoryId] ?? [];

function update(categoryId: string, fn: (list: Dream[]) => Dream[]) {
  const all = readAll();
  const list = fn([...(all[categoryId] ?? [])]).slice(-MAX_DREAMS_PER_TRACK);
  if (list.length) all[categoryId] = list;
  else delete all[categoryId];
  write(all);
}

/** Star a company on a track. A company already starred keeps its history; a board found later
 *  is filled in. */
export function starDream(
  categoryId: string,
  d: { company: string; website?: string; board?: Board },
): void {
  const key = dreamKey(d.company);
  if (!key) return;
  update(categoryId, (list) => {
    const at = list.findIndex((x) => x.key === key);
    if (at < 0)
      return [
        ...list,
        { ...d, company: d.company.trim(), key, seen: [], starredAt: new Date().toISOString() },
      ];
    const cur = list[at];
    list[at] = { ...cur, board: cur.board ?? d.board, website: cur.website ?? d.website };
    return list;
  });
}

export function unstarDream(categoryId: string, key: string): void {
  update(categoryId, (list) => list.filter((x) => x.key !== key));
}

/** Record a check: the posting ids now on its board, and when. */
export function markDreamChecked(categoryId: string, key: string, ids: string[], at: string): void {
  update(categoryId, (list) =>
    list.map((x) => (x.key === key ? { ...x, seen: ids.slice(0, MAX_SEEN), checkedAt: at } : x)),
  );
}

const rawNow = () => {
  try {
    return localStorage.getItem(DREAMS_KEY) ?? '';
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
const parse = (raw: string) => {
  try {
    return sanitizeDreams(raw ? JSON.parse(raw) : {});
  } catch {
    return {};
  }
};

/** A track's dream companies, live. */
export function useDreams(categoryId: string): Dream[] {
  const raw = useSyncExternalStore(subscribe, rawNow, rawNow);
  return useMemo(() => parse(raw)[categoryId] ?? [], [raw, categoryId]);
}

/** Every track's dream companies, live (the sync provider pushes when this changes). */
export function useAllDreams(): Record<string, Dream[]> {
  const raw = useSyncExternalStore(subscribe, rawNow, rawNow);
  return useMemo(() => parse(raw), [raw]);
}
