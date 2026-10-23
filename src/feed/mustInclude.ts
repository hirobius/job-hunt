// Must include (Calibrate, 2026-10-23): per track, the words a posting has to mention, in its title
// or its description, to be listed at all. The Design Systems track holds "systems": a posting
// that never says system or systems is of no interest (Adrian). Kept in `rjb_must_include` and
// synced in the blob (v11, ADR 0008 addendum). An entry is the user's own: one with no terms means
// they cleared it, so the one-time move to systems-only (systemsOnly.ts) never runs again. It
// also holds the ATS roles switched off (`atsOff`), which leave every search but stay on the track.
// Storage is untrusted: anything malformed reads as "no entry".
import { useMemo } from 'react';
import { liveStorage } from '../liveStorage';
import { loadPersisted, savePersisted } from '../persisted';
import { termRegex } from './match';

export const MUST_INCLUDE_KEY = 'rjb_must_include';
const MAX_TERMS = 20;

export interface MustInclude {
  /** A posting is listed only when its title or description mentions one (whole words). */
  terms: string[];
  /** The track's ATS roles switched off: kept on the track, left out of its searches. */
  atsOff: string[];
}

const UNSAFE = ['__proto__', 'constructor', 'prototype'];
const norm = (s: string) => s.trim().toLowerCase();

function cleanList(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of list) {
    if (typeof x !== 'string' || !x.trim() || seen.has(norm(x))) continue;
    seen.add(norm(x));
    out.push(x.trim());
  }
  return out;
}

function sanitizeOne(raw: unknown): MustInclude | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  return { terms: cleanList(o.terms).slice(0, MAX_TERMS), atsOff: cleanList(o.atsOff) };
}

export function sanitizeMustInclude(raw: unknown): Record<string, MustInclude> {
  const out: Record<string, MustInclude> = {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out;
  for (const [id, v] of Object.entries(raw)) {
    const ok = id && !UNSAFE.includes(id) ? sanitizeOne(v) : null;
    if (ok) out[id] = ok;
  }
  return out;
}

const readAll = () => sanitizeMustInclude(loadPersisted<unknown>(MUST_INCLUDE_KEY, {}));
const live = liveStorage(MUST_INCLUDE_KEY);
const write = (all: Record<string, MustInclude>) => {
  savePersisted(MUST_INCLUDE_KEY, all);
  live.notify();
};

/** Every track's entry (for the sync blob and backup). */
export const getAllMustInclude = readAll;

/** Replace the whole store (a pull, a restore) and notify subscribers. */
export function replaceMustInclude(all: Record<string, MustInclude>): void {
  write(sanitizeMustInclude(all));
}

/** Union by track; `cloud` wins on a track both have (like the sweep titles). */
export function mergeMustInclude(
  cloud: Record<string, MustInclude>,
  local: Record<string, MustInclude>,
): Record<string, MustInclude> {
  return { ...local, ...cloud };
}

const NONE: MustInclude = { terms: [], atsOff: [] };

export const mustIncludeFor = (all: Record<string, MustInclude>, categoryId: string) =>
  all[categoryId] ?? NONE;

export const readMustInclude = (categoryId: string): MustInclude =>
  mustIncludeFor(readAll(), categoryId);

/** Whether the track has an entry at all (set by a pack, the move, or the user). */
export const hasMustInclude = (categoryId: string): boolean => categoryId in readAll();

/** Write a track's entry (merged over what it has). */
export function setMustInclude(categoryId: string, patch: Partial<MustInclude>): void {
  if (!categoryId || UNSAFE.includes(categoryId)) return;
  const all = readAll();
  const next = sanitizeOne({ ...mustIncludeFor(all, categoryId), ...patch });
  if (next) all[categoryId] = next;
  write(all);
}

/** The track's ATS roles that are on. */
export const activeAtsRoles = (atsRoles: string[], m: MustInclude): string[] => {
  const off = new Set(m.atsOff.map(norm));
  return atsRoles.filter((r) => !off.has(norm(r)));
};

/** True when `text` mentions one of `terms` as whole words, singular or plural, ignoring case
 *  ("systems" matches "Design System" and "UI systems", never "ecosystem"). No terms: true. */
export function mentionsAny(terms: string[], ...texts: string[]): boolean {
  const res = terms.map(termRegex).filter((r): r is RegExp => r !== null);
  if (!res.length) return true;
  return res.some((re) => texts.some((t) => re.test(t)));
}

/** Postings (or roles) that pass the must-include rule: a term in the title or the description. */
export function keepIncluded<P extends { title: string; text: string }>(
  postings: P[],
  terms: string[],
): P[] {
  if (!terms.some((t) => t.trim())) return postings;
  return postings.filter((p) => mentionsAny(terms, p.title, p.text));
}

/** Every track's entry, live. */
export function useAllMustInclude(): Record<string, MustInclude> {
  const raw = live.useRaw();
  return useMemo(() => {
    try {
      return sanitizeMustInclude(raw ? JSON.parse(raw) : {});
    } catch {
      return {};
    }
  }, [raw]);
}

/** A track's entry, live. */
export function useMustInclude(categoryId: string): MustInclude {
  const all = useAllMustInclude();
  return useMemo(() => mustIncludeFor(all, categoryId), [all, categoryId]);
}
