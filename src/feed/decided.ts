// Decided (simplify 5/9, #386; on the synced stores since 7/11, #388): what the user did in
// Review new, kept so a Posting never comes back to it. A verdict is by Posting (its fingerprint),
// never by company: Skip hides that one posting. Not this company is a separate flag, a muted
// Source. Saving follows the company (feed/follow.ts).
//
// The Feed's view of three synced v12 stores: verdicts are `decided[]` (src/decided.ts), muted and
// followed companies are Sources (src/sources.ts: `muted`, and `company` Sources). This browser's
// first-seen days (`rjb_feed_seen`) are a cache: they only feed "N new today", so they stay local.
// Before 7/11 this module kept its own object under `rjb_decided`, the key src/decided.ts keeps its
// list under, so a pull dropped it: src/decided.ts `moveLegacyDecided` moves one into the stores.
import { useMemo } from 'react';
import { dedupKey } from '../store';
import { fingerprint as scoreFingerprint } from '../tracks/score.ts';
import { loadPersisted, savePersisted } from '../persisted';
import { decided as decidedStore, getDecided, type Decided } from '../decided';
import {
  addSources,
  getSources,
  muteSource,
  removeSource,
  sourceKey,
  updateSources,
  useSources,
  type Source,
} from '../sources';
import type { Posting } from './types';

export const DECIDED_KEY = 'rjb_decided';
export const SEEN_KEY = 'rjb_feed_seen';
/** First-seen days kept, newest first. */
export const MAX_SEEN = 5000;

export type Verdict = 'saved' | 'skipped';

export type Decision = Decided;

export interface DecidedState {
  decided: Decision[];
  /** Companies (as named) the user said Not this company to; compared by `companyKey`. */
  muted: string[];
  /** Companies followed with no board to watch. */
  followed: string[];
}

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

/** Whether `list` (names) holds this company. */
export const hasCompany = (list: readonly string[], company: string) =>
  list.some((x) => companyKey(x) === companyKey(company));

/** The Feed's state from the stores' values. Pure. */
export function decidedStateOf(decided: readonly Decision[], sources: readonly Source[]) {
  return {
    decided: [...decided],
    muted: sources.filter((s) => s.muted && s.kind !== 'feed').map((s) => s.label),
    followed: sources.filter((s) => s.kind === 'company' && !s.muted).map((s) => s.label),
  };
}

export const getAllDecided = (): DecidedState => decidedStateOf(getDecided(), getSources());

/** Record a verdict on one posting. */
export function decide(p: Pick<Posting, 'company' | 'title' | 'url'>, verdict: Verdict): void {
  decidedStore.set(postingFingerprint(p), verdict);
}

/** Undo a verdict: the posting is back in Review new. */
export function undecide(p: Pick<Posting, 'company' | 'title' | 'url'>): void {
  decidedStore.undo(postingFingerprint(p));
}

/** Sources named for this company (boards and followed companies), not feeds. */
const namedFor = (all: Source[], company: string) =>
  all.filter((s) => s.kind !== 'feed' && companyKey(s.label) === companyKey(company));

const companySource = (company: string, extra?: Partial<Source>): Source => ({
  kind: 'company',
  ref: companyKey(company),
  label: company.trim().replace(/\s+/g, ' '),
  ...extra,
});

/** Not this company: every Source named for it is muted (one is added when none is). Returns the
 *  undo, which puts each back as it was. */
export function muteCompany(company: string): () => void {
  if (!companyKey(company)) return () => {};
  const named = namedFor(getSources(), company);
  if (!named.length) {
    const s = companySource(company, { muted: true });
    addSources([s]);
    return () => removeSource(sourceKey(s));
  }
  const was = named.filter((s) => !s.muted).map(sourceKey);
  was.forEach((k) => muteSource(k, true));
  return () => was.forEach((k) => muteSource(k, false));
}

/** Lift a company's mute: every Source named for it is read again. */
export function unmuteCompany(company: string): void {
  for (const s of namedFor(getSources(), company)) if (s.muted) muteSource(sourceKey(s), false);
}

/** Follow a company by name (it has no board to watch). Muted: the mute is lifted. Returns the
 *  undo. */
export function followCompany(company: string): () => void {
  if (!companyKey(company)) return () => {};
  const named = namedFor(getSources(), company);
  if (named.some((s) => !s.muted)) return () => {};
  if (named.length) {
    const keys = named.map(sourceKey);
    keys.forEach((k) => muteSource(k, false));
    return () => keys.forEach((k) => muteSource(k, true));
  }
  const s = companySource(company);
  addSources([s]);
  return () => removeSource(sourceKey(s));
}

/** Stop following a company followed by name (its `company` Source goes). */
export function unfollowCompany(company: string): void {
  const k = companyKey(company);
  updateSources((cur) => cur.filter((s) => !(s.kind === 'company' && companyKey(s.label) === k)));
}

export function useDecided(): DecidedState {
  const map = decidedStore.use();
  const sources = useSources();
  return useMemo(() => decidedStateOf([...map.values()], sources), [map, sources]);
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
