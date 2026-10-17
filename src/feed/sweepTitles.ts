// The wide sweep's titles (#213): per track, the list of titles one sweep searches at once and which
// of them are on. Kept in `rjb_sweep_titles` and synced in the blob (v7, ADR 0008). A track with no
// entry uses its own titles, all on; the first edit stores the list. Storage is untrusted: anything
// malformed reads as "no entry".
import { useMemo, useSyncExternalStore } from 'react';
import { loadPersisted, savePersisted } from '../persisted';

export const SWEEP_KEY = 'rjb_sweep_titles';
/** At most this many titles are on at once: each one is a request to every term source. */
export const MAX_SWEEP_ON = 12;
/** And at most this many in a track's list. */
export const MAX_SWEEP_TITLES = 40;

export interface SweepTitles {
  titles: string[];
  /** Titles in `titles` that are switched off. */
  off: string[];
}

const UNSAFE = ['__proto__', 'constructor', 'prototype'];
const norm = (s: string) => s.trim().toLowerCase();

/** Trimmed, de-duplicated (ignoring case), first spelling kept. */
export function cleanTitles(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of list) {
    if (typeof x !== 'string' || !x.trim() || seen.has(norm(x))) continue;
    seen.add(norm(x));
    out.push(x.trim());
  }
  return out.slice(0, MAX_SWEEP_TITLES);
}

function sanitizeOne(raw: unknown): SweepTitles | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const titles = cleanTitles(o.titles);
  if (!titles.length) return null;
  const known = new Set(titles.map(norm));
  return { titles, off: cleanTitles(o.off).filter((t) => known.has(norm(t))) };
}

export function sanitizeSweeps(raw: unknown): Record<string, SweepTitles> {
  const out: Record<string, SweepTitles> = {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out;
  for (const [id, v] of Object.entries(raw)) {
    const ok = id && !UNSAFE.includes(id) ? sanitizeOne(v) : null;
    if (ok) out[id] = ok;
  }
  return out;
}

const readAll = () => sanitizeSweeps(loadPersisted<unknown>(SWEEP_KEY, {}));
const listeners = new Set<() => void>();
const write = (all: Record<string, SweepTitles>) => {
  savePersisted(SWEEP_KEY, all);
  listeners.forEach((l) => l());
};

/** Every track's sweep titles (for the sync blob). */
export const getAllSweeps = readAll;

/** Replace the whole store (a pull) and notify subscribers. */
export function replaceSweeps(all: Record<string, SweepTitles>): void {
  write(sanitizeSweeps(all));
}

/** Union by track; `cloud` wins on a track both have, local-only tracks are kept (like work mode). */
export function mergeSweeps(
  cloud: Record<string, SweepTitles>,
  local: Record<string, SweepTitles>,
): Record<string, SweepTitles> {
  return { ...local, ...cloud };
}

/** A track's sweep: its stored entry, else `seed` (the track's own titles) all on. */
export function sweepFor(
  all: Record<string, SweepTitles>,
  categoryId: string,
  seed: string[],
): SweepTitles {
  return all[categoryId] ?? { titles: cleanTitles(seed), off: [] };
}

/** The titles a sweep searches: on, in list order, at most MAX_SWEEP_ON. */
export const activeTitles = (s: SweepTitles): string[] => {
  const off = new Set(s.off.map(norm));
  return s.titles.filter((t) => !off.has(norm(t))).slice(0, MAX_SWEEP_ON);
};

function edit(categoryId: string, seed: string[], change: (s: SweepTitles) => SweepTitles) {
  const all = readAll();
  const next = sanitizeOne(change(sweepFor(all, categoryId, seed)));
  if (next) all[categoryId] = next;
  else delete all[categoryId];
  write(all);
}

/** Switch one title on or off. Turning one on past MAX_SWEEP_ON is refused (returns false). */
export function setTitleOn(categoryId: string, seed: string[], title: string, on: boolean): boolean {
  const cur = sweepFor(readAll(), categoryId, seed);
  if (on && activeTitles(cur).length >= MAX_SWEEP_ON) return false;
  edit(categoryId, seed, (s) => ({
    ...s,
    off: on ? s.off.filter((t) => norm(t) !== norm(title)) : [...s.off, title],
  }));
  return true;
}

/** Add a title (on when there is room, else off). A title already listed is left alone. */
export function addTitle(categoryId: string, seed: string[], title: string): void {
  const t = title.trim();
  if (!t) return;
  edit(categoryId, seed, (s) => {
    if (s.titles.some((x) => norm(x) === norm(t))) return s;
    const full = activeTitles(s).length >= MAX_SWEEP_ON;
    return { titles: [...s.titles, t], off: full ? [...s.off, t] : s.off };
  });
}

/** Remove a title from the track's sweep list. */
export function removeTitle(categoryId: string, seed: string[], title: string): void {
  edit(categoryId, seed, (s) => ({
    titles: s.titles.filter((x) => norm(x) !== norm(title)),
    off: s.off.filter((x) => norm(x) !== norm(title)),
  }));
}

const rawNow = () => {
  try {
    return localStorage.getItem(SWEEP_KEY) ?? '';
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

/** Every track's sweep titles, live. */
export function useAllSweeps(): Record<string, SweepTitles> {
  const raw = useSyncExternalStore(subscribe, rawNow, rawNow);
  return useMemo(() => {
    try {
      return sanitizeSweeps(raw ? JSON.parse(raw) : {});
    } catch {
      return {};
    }
  }, [raw]);
}

/** A track's sweep titles, live. `seed` is the track's own titles. */
export function useSweep(categoryId: string, seed: string[]): SweepTitles {
  const all = useAllSweeps();
  const seedKey = seed.join('\n');
  return useMemo(
    () => sweepFor(all, categoryId, seedKey ? seedKey.split('\n') : []),
    [all, categoryId, seedKey],
  );
}
