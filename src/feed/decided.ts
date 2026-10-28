// Decided (simplify 5/9, #386): what the user did in Review new, kept so a Posting never comes
// back to it. A verdict is by Posting (its fingerprint), never by company: Skip hides that one
// posting. Not this company is a separate flag, a muted company. Saving follows the company: a
// board posting watches its board (feed/watchlist.ts), any other one is kept here as a followed
// company until Sources (#384) take these over.
//
// One store in local storage (`rjb_decided`), untrusted on read. #384's blob v12 carries
// `decided[]` and `sources[]` (muted, followed); until it lands this store is per browser, with
// getAll/replace/merge ready for the blob. First-seen days (`rjb_feed_seen`) are a cache: they only
// feed "N new today", so they stay local.
import { useMemo, useSyncExternalStore } from 'react';
import { dedupKey } from '../store';
import { fingerprint as scoreFingerprint } from '../tracks/score.ts';
import { loadPersisted, savePersisted } from '../persisted';
import type { Posting } from './types';

export const DECIDED_KEY = 'rjb_decided';
export const SEEN_KEY = 'rjb_feed_seen';
/** Verdicts kept: the newest this many (a few months of daily review). */
export const MAX_DECIDED = 3000;
/** First-seen days kept, newest first. */
export const MAX_SEEN = 5000;

export type Verdict = 'saved' | 'skipped';

export interface Decision {
  fingerprint: string;
  verdict: Verdict;
  /** ISO time. */
  at: string;
}

export interface DecidedState {
  decided: Decision[];
  /** Companies (as named) the user said Not this company to; compared by `companyKey`. */
  muted: string[];
  /** Companies followed by saving one of their postings that has no board to watch. */
  followed: string[];
}

const EMPTY: DecidedState = { decided: [], muted: [], followed: [] };

/** A company's key: one per company, whatever its case or spacing. */
export const companyKey = (company: string) => company.trim().replace(/\s+/g, ' ').toLowerCase();

/** A posting's fingerprint: the scorer's (company + title without seniority words, the server's
 *  `postings.fingerprint`), or its link when it names no company (two unnamed "Designer" posts
 *  are not one posting). */
export function postingFingerprint(p: Pick<Posting, 'company' | 'title' | 'url'>): string {
  return p.company.trim()
    ? scoreFingerprint({ company: p.company, title: p.title })
    : `url:${dedupKey(p.url)}`;
}

/** Company names as the user saw them, one per company (by key), the last spelling kept. */
const names = (v: unknown, max: number): string[] => {
  if (!Array.isArray(v)) return [];
  const out = new Map<string, string>();
  for (const x of v)
    if (typeof x === 'string' && x.trim()) {
      out.delete(companyKey(x));
      out.set(companyKey(x), x.trim().replace(/\s+/g, ' '));
    }
  return [...out.values()].slice(-max);
};

/** Whether `list` (names) holds this company. */
export const hasCompany = (list: readonly string[], company: string) =>
  list.some((x) => companyKey(x) === companyKey(company));

export function sanitizeDecided(raw: unknown): DecidedState {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ...EMPTY };
  const o = raw as Record<string, unknown>;
  const byFp = new Map<string, Decision>();
  for (const d of Array.isArray(o.decided) ? o.decided : []) {
    if (typeof d !== 'object' || d === null) continue;
    const r = d as Record<string, unknown>;
    if (typeof r.fingerprint !== 'string' || !r.fingerprint) continue;
    if (r.verdict !== 'saved' && r.verdict !== 'skipped') continue;
    const at = typeof r.at === 'string' ? r.at : new Date(0).toISOString();
    byFp.delete(r.fingerprint);
    byFp.set(r.fingerprint, { fingerprint: r.fingerprint, verdict: r.verdict, at });
  }
  return {
    decided: [...byFp.values()].slice(-MAX_DECIDED),
    muted: names(o.muted, 500),
    followed: names(o.followed, 500),
  };
}

const readAll = () => sanitizeDecided(loadPersisted<unknown>(DECIDED_KEY, {}));
const listeners = new Set<() => void>();
const write = (s: DecidedState) => {
  savePersisted(DECIDED_KEY, s);
  listeners.forEach((l) => l());
};

export const getAllDecided = readAll;

export function replaceDecided(s: DecidedState): void {
  write(sanitizeDecided(s));
}

/** Union: a posting decided on either side stays decided (the newer verdict wins). */
export function mergeDecided(cloud: DecidedState, local: DecidedState): DecidedState {
  const newer = new Map<string, Decision>();
  for (const d of [...local.decided, ...cloud.decided]) {
    const cur = newer.get(d.fingerprint);
    if (!cur || d.at >= cur.at) newer.set(d.fingerprint, d);
  }
  return sanitizeDecided({
    decided: [...newer.values()].sort((a, b) => a.at.localeCompare(b.at)),
    muted: [...cloud.muted, ...local.muted],
    followed: [...cloud.followed, ...local.followed],
  });
}

function update(fn: (s: DecidedState) => DecidedState) {
  write(sanitizeDecided(fn(readAll())));
}

/** Record a verdict on one posting. */
export function decide(p: Pick<Posting, 'company' | 'title' | 'url'>, verdict: Verdict): void {
  const fp = postingFingerprint(p);
  update((s) => ({
    ...s,
    decided: [
      ...s.decided.filter((d) => d.fingerprint !== fp),
      { fingerprint: fp, verdict, at: new Date().toISOString() },
    ],
  }));
}

/** Undo a verdict: the posting is back in Review new. */
export function undecide(p: Pick<Posting, 'company' | 'title' | 'url'>): void {
  const fp = postingFingerprint(p);
  update((s) => ({ ...s, decided: s.decided.filter((d) => d.fingerprint !== fp) }));
}

export function muteCompany(company: string): void {
  const k = companyKey(company);
  if (k) update((s) => ({ ...s, muted: [...s.muted, company] }));
}

export function unmuteCompany(company: string): void {
  const k = companyKey(company);
  update((s) => ({ ...s, muted: s.muted.filter((x) => companyKey(x) !== k) }));
}

export function followCompany(company: string): void {
  const k = companyKey(company);
  if (k) update((s) => ({ ...s, followed: [...s.followed, company] }));
}

export function unfollowCompany(company: string): void {
  const k = companyKey(company);
  update((s) => ({ ...s, followed: s.followed.filter((x) => companyKey(x) !== k) }));
}

const rawNow = () => {
  try {
    return localStorage.getItem(DECIDED_KEY) ?? '';
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

export function useDecided(): DecidedState {
  const raw = useSyncExternalStore(subscribe, rawNow, rawNow);
  return useMemo(() => {
    try {
      return sanitizeDecided(raw ? JSON.parse(raw) : {});
    } catch {
      return { ...EMPTY };
    }
  }, [raw]);
}

// ---- first seen ----

/** YYYY-MM-DD in local time. */
export const dayOf = (now: number) => {
  const d = new Date(now);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** The day each fingerprint was first read by this browser. Untrusted on read. */
export function readSeen(): Record<string, string> {
  const raw = loadPersisted<unknown>(SEEN_KEY, {});
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw))
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) out[k] = v;
  return out;
}

/** Note today as the first-seen day of every fingerprint not seen before; returns the full map.
 *  Writes nothing when nothing is new. */
export function noteSeen(fingerprints: string[], now: number): Record<string, string> {
  const seen = readSeen();
  const today = dayOf(now);
  let added = false;
  for (const fp of fingerprints)
    if (!(fp in seen)) {
      seen[fp] = today;
      added = true;
    }
  if (!added) return seen;
  // Newest days kept first when over the cap.
  const entries = Object.entries(seen);
  const kept =
    entries.length > MAX_SEEN
      ? Object.fromEntries(entries.sort((a, b) => b[1].localeCompare(a[1])).slice(0, MAX_SEEN))
      : seen;
  savePersisted(SEEN_KEY, kept);
  return kept;
}
