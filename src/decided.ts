// Decided postings (blob v12, simplify spec): what the person already did with a posting in Review
// new, so it never comes back. Kept by posting fingerprint only (company + title, seniority words
// dropped: tracks/score.ts `fingerprint`), never by company: Skip hides that one posting, and
// "Not this company" is a separate action on the Source (sources.ts `muteSource`).
// Kept in `rjb_decided`, synced in the blob. Storage and the cloud are untrusted.
import { useMemo } from 'react';
import { liveStorage } from './liveStorage';
import { savePersisted } from './persisted';
import { fingerprint } from './tracks/score';
import { updateSources } from './sources';
import { nameKey, type Source } from './sourcesModel';
import { httpUrl } from './httpUrl';

export const DECIDED_KEY = 'rjb_decided';
/** Newest kept: a year of heavy triage. */
export const MAX_DECIDED = 5000;

export type Verdict = 'saved' | 'skipped';
const VERDICTS: readonly Verdict[] = ['saved', 'skipped'];

export interface Decided {
  fingerprint: string;
  verdict: Verdict;
  /** ISO time of the decision; the later one wins on a merge. */
  at: string;
  /** What the posting was, kept with a Skip so Apply's Passed view can list it (2026-11-13).
   *  Older entries have none and read as "Skipped posting". */
  title?: string;
  company?: string;
  /** An http(s) link only. */
  url?: string;
  /** Deleted from Passed: still decided (it never comes back in Review), no longer listed. */
  hidden?: true;
}

/** What a Skip keeps about its posting. */
export type PostingInfo = Pick<Decided, 'title' | 'company' | 'url'>;

const text = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, 300) : '');

/** A posting's fingerprint, the key `decided` is kept by. */
export const postingFingerprint = (p: { company: string; title: string }) => fingerprint(p);

function sanitizeOne(raw: unknown): Decided | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const fp = typeof o.fingerprint === 'string' ? o.fingerprint.trim() : '';
  if (!fp || !VERDICTS.includes(o.verdict as Verdict)) return null;
  const title = text(o.title);
  const company = text(o.company);
  const url = typeof o.url === 'string' ? httpUrl(o.url.trim().slice(0, 2000)) : null;
  return {
    fingerprint: fp,
    verdict: o.verdict as Verdict,
    at: typeof o.at === 'string' ? o.at : new Date(0).toISOString(),
    ...(title && { title }),
    ...(company && { company }),
    ...(url && { url }),
    ...(o.hidden === true && { hidden: true as const }),
  };
}

/** One entry per fingerprint (the latest decision), oldest first, newest MAX_DECIDED kept. */
function settle(list: Decided[]): Decided[] {
  const by = new Map<string, Decided>();
  for (const d of list) {
    const cur = by.get(d.fingerprint);
    if (!cur || d.at >= cur.at) by.set(d.fingerprint, d);
  }
  return [...by.values()].sort((a, b) => a.at.localeCompare(b.at)).slice(-MAX_DECIDED);
}

export function sanitizeDecided(raw: unknown): Decided[] {
  if (!Array.isArray(raw)) return [];
  return settle(raw.map(sanitizeOne).filter((x): x is Decided => !!x));
}

/** Union by fingerprint; the later decision wins (a tie goes to the cloud). */
export function mergeDecided(cloud: Decided[], local: Decided[]): Decided[] {
  return settle([...local, ...cloud]);
}

// Parsed once per stored string: the Feed asks `decided.has` for every row it shows.
let cache: { raw: string | null; list: Decided[] } | null = null;
function readAll(): Decided[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(DECIDED_KEY);
  } catch {
    /* blocked storage reads as none */
  }
  if (cache?.raw !== raw) {
    let parsed: unknown = [];
    try {
      parsed = raw ? JSON.parse(raw) : [];
    } catch {
      /* malformed reads as none */
    }
    cache = { raw, list: sanitizeDecided(parsed) };
  }
  return cache.list;
}
const live = liveStorage(DECIDED_KEY);
const write = (all: Decided[]) => {
  savePersisted(DECIDED_KEY, all);
  live.notify();
};

/** Every decision (for the sync blob and backup). */
export const getDecided = readAll;

/** Replace the whole list (a pull, a restore) and notify subscribers. */
export function replaceDecided(all: Decided[]): void {
  write(sanitizeDecided(all));
}

/** Live: fingerprint → decision. */
function useDecidedMap(): Map<string, Decided> {
  const raw = live.useRaw();
  return useMemo(() => {
    try {
      return new Map(sanitizeDecided(raw ? JSON.parse(raw) : []).map((d) => [d.fingerprint, d]));
    } catch {
      return new Map();
    }
  }, [raw]);
}

/** The `decided` API the Feed and Review new read and write. */
export const decided = {
  /** The decision on a posting, or null. */
  get: (fp: string): Decided | null => readAll().find((d) => d.fingerprint === fp) ?? null,
  /** Whether a posting was decided either way. */
  has: (fp: string): boolean => readAll().some((d) => d.fingerprint === fp),
  /** Record (or change) a decision. Returns the entry, for Undo. */
  set(
    fp: string,
    verdict: Verdict,
    at = new Date().toISOString(),
    info: PostingInfo = {},
  ): Decided | null {
    const d = sanitizeOne({ ...info, fingerprint: fp, verdict, at });
    if (!d) return null;
    write(settle([...readAll().filter((x) => x.fingerprint !== d.fingerprint), d]));
    return d;
  },
  /** Undo: forget a decision, or put back `prev` (what it was before), stamped now so a sync
   *  keeps it over the decision it undoes (the later one wins). */
  undo(fp: string, prev?: Decided | null, at = new Date().toISOString()): void {
    const rest = readAll().filter((x) => x.fingerprint !== fp);
    write(settle(prev ? [...rest, { ...prev, at }] : rest));
  },
  /** Delete from Passed: the decision stays (the posting never comes back), marked hidden and
   *  stamped now so a sync keeps it. Returns what it was, for Undo (`undo(fp, prev)`). */
  hide(fp: string, at = new Date().toISOString()): Decided | null {
    const cur = readAll().find((d) => d.fingerprint === fp);
    if (!cur) return null;
    write(settle([...readAll().filter((x) => x.fingerprint !== fp), { ...cur, hidden: true, at }]));
    return cur;
  },
  /** Every decision, live, by fingerprint. */
  use: useDecidedMap,
};

/** Before #388 Review new kept `{ decided, muted, followed }` under this same key (feed/decided.ts),
 *  so the first pull dropped it. Run once at start (main.tsx), before sync: an old object's verdicts
 *  become this list, its muted companies muted Sources and its followed ones company Sources. A
 *  list is left as it is. */
export function moveLegacyDecided(): void {
  let raw: unknown;
  try {
    raw = JSON.parse(localStorage.getItem(DECIDED_KEY) ?? '[]');
  } catch {
    return;
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return;
  const o = raw as Record<string, unknown>;
  const names = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!nameKey(x)) : [];
  replaceDecided(sanitizeDecided(o.decided));
  const muted = names(o.muted);
  const mutedKeys = new Set(muted.map(nameKey));
  const followed = names(o.followed).filter((n) => !mutedKeys.has(nameKey(n)));
  // One write for every company: a Source named for it is muted, else a company Source is added.
  updateSources((cur) => {
    const next = cur.map((s) =>
      s.kind !== 'feed' && mutedKeys.has(nameKey(s.label)) ? { ...s, muted: true as const } : s,
    );
    const named = new Set(next.filter((s) => s.kind !== 'feed').map((s) => nameKey(s.label)));
    const add = (name: string, mute: boolean): Source[] => {
      const k = nameKey(name);
      if (named.has(k)) return [];
      named.add(k);
      return [{ kind: 'company', ref: k, label: name.trim(), ...(mute && { muted: true }) }];
    };
    return [
      ...next,
      ...muted.flatMap((n) => add(n, true)),
      ...followed.flatMap((n) => add(n, false)),
    ];
  });
}
