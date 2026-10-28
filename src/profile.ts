// The Search profile (blob v12, simplify spec): what the Feed looks for, in place of tracks. One
// entry today, stored as `profiles[]` so a second one never needs a new blob version. It holds the
// titles (the wide sweep runs over every title that is on, no cap of 12), the ATS roles, must
// include with its related titles, leave out, pay floor, level, location and work mode. A profile
// with `scorer` uses that tuned config (src/tracks) instead of the phrase rules, Review included.
// Kept in `rjb_profiles`, synced in the blob. Storage and the cloud are untrusted.
import { useMemo } from 'react';
import { liveStorage } from './liveStorage';
import { mergeByKey } from './mergeByKey';
import { loadPersisted, savePersisted } from './persisted';
import type { Seniority } from './curation/types';
import type { WorkMode } from './jobsData';

export const PROFILES_KEY = 'rjb_profiles';
export const MAX_PROFILES = 4;
/** Titles per profile: the union of every track's titles fits with room to spare. */
export const MAX_PROFILE_TITLES = 200;
const MAX_TERMS = 50;

/** Tuned scorer configs a profile can use (src/tracks/track-config.ts). */
export const SCORERS = ['design-systems'] as const;
export type ScorerId = (typeof SCORERS)[number];

export interface ProfileInclude {
  /** A posting is listed only when it says one of these (exact phrases, mustInclude.ts rules). */
  terms: string[];
  /** Search the title (absent = on). */
  inTitle?: boolean;
  /** Search the description (absent = off). */
  inText?: boolean;
  /** Related titles let a posting in (absent = on). */
  related?: boolean;
  /** Related titles switched off, by id (mustInclude.ts RELATED_TITLES). */
  relatedOff?: string[];
}

export interface Profile {
  id: string;
  label: string;
  /** Every title searched, in order. */
  titles: string[];
  /** Titles in `titles` switched off (kept, not searched). */
  titlesOff: string[];
  /** Titles in `titlesOff` the v11 move put off (not searched there), not the person: the move's
   *  top-up turns one on once an old screen searches it. Turning one on drops it from here. */
  movedOff?: string[];
  /** ATS hidden-jobs search terms. */
  atsRoles: string[];
  /** ATS roles switched off. */
  atsOff: string[];
  include: ProfileInclude;
  /** Leave out: a posting that says any of these is hidden. */
  leaveOut: string[];
  /** Yearly, in dollars; only where a source states pay. */
  payFloor?: number;
  /** Also hide postings that state no pay. */
  payOnly?: true;
  level: Seniority;
  /** '' = anywhere. */
  location: string;
  mode: WorkMode;
  scorer?: ScorerId;
  /** The track it was made from (the v11 move), for reference only. */
  fromTrack?: string;
  createdAt: string;
}

const MODES: readonly WorkMode[] = ['any', 'remote', 'hybrid', 'onsite'];
const LEVELS: readonly Seniority[] = ['any', 'entry', 'experienced'];
const norm = (s: string) => s.trim().toLowerCase();

/** Trimmed, de-duplicated ignoring case, first spelling kept. */
export function cleanList(list: unknown, max = MAX_TERMS): string[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of list) {
    if (typeof x !== 'string' || !x.trim() || seen.has(norm(x))) continue;
    seen.add(norm(x));
    out.push(x.trim());
  }
  return out.slice(0, max);
}

/** Only entries of `list` that are in `of` (ignoring case). */
const within = (list: string[], of: string[]) => {
  const known = new Set(of.map(norm));
  return list.filter((x) => known.has(norm(x)));
};

function sanitizeInclude(raw: unknown): ProfileInclude {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: ProfileInclude = { terms: cleanList(o.terms) };
  if (o.inTitle === false) out.inTitle = false;
  if (o.inText === true) out.inText = true;
  if (o.related === false) out.related = false;
  const off = cleanList(o.relatedOff);
  if (off.length) out.relatedOff = off;
  return out;
}

function sanitizeOne(raw: unknown): Profile | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === 'string' ? o.id.trim() : '';
  if (!id) return null;
  const titles = cleanList(o.titles, MAX_PROFILE_TITLES);
  const atsRoles = cleanList(o.atsRoles, MAX_PROFILE_TITLES);
  const out: Profile = {
    id,
    label: typeof o.label === 'string' && o.label.trim() ? o.label.trim() : 'Search profile',
    titles,
    titlesOff: within(cleanList(o.titlesOff, MAX_PROFILE_TITLES), titles),
    atsRoles,
    atsOff: within(cleanList(o.atsOff, MAX_PROFILE_TITLES), atsRoles),
    include: sanitizeInclude(o.include),
    leaveOut: cleanList(o.leaveOut),
    level: LEVELS.includes(o.level as Seniority) ? (o.level as Seniority) : 'any',
    location: typeof o.location === 'string' ? o.location.trim() : '',
    mode: MODES.includes(o.mode as WorkMode) ? (o.mode as WorkMode) : 'any',
    createdAt: typeof o.createdAt === 'string' ? o.createdAt : new Date(0).toISOString(),
  };
  const movedOff = within(cleanList(o.movedOff, MAX_PROFILE_TITLES), out.titlesOff);
  if (movedOff.length) out.movedOff = movedOff;
  if (typeof o.payFloor === 'number' && o.payFloor > 0) out.payFloor = o.payFloor;
  if (o.payOnly === true) out.payOnly = true;
  if ((SCORERS as readonly string[]).includes(o.scorer as string))
    out.scorer = o.scorer as ScorerId;
  if (typeof o.fromTrack === 'string' && o.fromTrack) out.fromTrack = o.fromTrack;
  return out;
}

export function sanitizeProfiles(raw: unknown): Profile[] {
  if (!Array.isArray(raw)) return [];
  const ok = raw.map(sanitizeOne).filter((x): x is Profile => !!x);
  return mergeByKey((p) => p.id, null, ok).slice(0, MAX_PROFILES);
}

/** Union by id; `cloud` wins on a profile both have (like the per-track settings it replaces). */
export function mergeProfiles(cloud: Profile[], local: Profile[]): Profile[] {
  const merged = mergeByKey((p) => p.id, cloud, local);
  // The cloud's first profile stays first: it is the one in use on every other device.
  const first = cloud[0]?.id;
  const ordered = first
    ? [...merged.filter((p) => p.id === first), ...merged.filter((p) => p.id !== first)]
    : merged;
  return ordered.slice(0, MAX_PROFILES);
}

/** The titles a sweep searches: every one that is on, in order. */
export const profileTitles = (p: Profile): string[] => {
  const off = new Set(p.titlesOff.map(norm));
  return p.titles.filter((t) => !off.has(norm(t)));
};

/** Add titles a profile lacks (ignoring case), on. Pure. */
export function withTitles(p: Profile, add: readonly string[]): Profile {
  return { ...p, titles: cleanList([...p.titles, ...add], MAX_PROFILE_TITLES) };
}

const readAll = () => sanitizeProfiles(loadPersisted<unknown>(PROFILES_KEY, []));
const live = liveStorage(PROFILES_KEY);
const write = (all: Profile[]) => {
  savePersisted(PROFILES_KEY, all);
  live.notify();
};

/** Every profile (for the sync blob and backup). */
export const getProfiles = readAll;

/** The profile in use, or null before the v11 move / onboarding made one. */
export const getProfile = (): Profile | null => readAll()[0] ?? null;

/** Replace the whole list (a pull, a restore) and notify subscribers. */
export function replaceProfiles(all: Profile[]): void {
  write(sanitizeProfiles(all));
}

/** Change the profile in use (merged over what it has). No profile yet: nothing happens. */
export function updateProfile(change: Partial<Omit<Profile, 'id' | 'createdAt'>>): boolean {
  const all = readAll();
  if (!all.length) return false;
  const next = sanitizeOne({ ...all[0], ...change });
  if (!next) return false;
  all[0] = next;
  write(all);
  return true;
}

/** Every profile, live. */
export function useProfiles(): Profile[] {
  const raw = live.useRaw();
  return useMemo(() => {
    try {
      return sanitizeProfiles(raw ? JSON.parse(raw) : []);
    } catch {
      return [];
    }
  }, [raw]);
}

/** The profile in use, live; null before one exists. */
export function useProfile(): Profile | null {
  return useProfiles()[0] ?? null;
}
