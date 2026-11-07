import { createStore } from './createStore';
import { cleanPlace } from './cleanPlace';
import { safeJobUrl } from './httpUrl';
import { mergeByKey } from './mergeByKey';
import { type Job, type JobMode, type Status } from './types';
import {
  applyStatus,
  logFollowUp as applyFollowUp,
  normSnooze,
  normStatus,
  snoozeFollowUp as applySnooze,
} from './jobState';
import { normalizeScreening } from './screening';
import { sanitizeDecks } from './decks';
import { normDate, normJobDates, recordLiveness } from './jobDates';
import type { LiveCheck } from './feed/liveness';
import { parseBoardUrl } from './feed/sources/boardUrl';
import { prettySlug } from './feed/sources/http';

const KEY = 'rjb_shortlist'; // same key as the legacy app
const RETIRED: Record<string, 1> = {
  'https://jobs.lever.co/entrata/aa9f605b-8360-416d-94fc-ed5d5a68602c': 1,
};

export function hostOf(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
// Job-board hosts whose first path segment is the employer (boards.greenhouse.io/<company>/…).
const ATS_HOSTS: Record<string, string> = {
  'boards.greenhouse.io': 'Greenhouse',
  'job-boards.greenhouse.io': 'Greenhouse',
  'jobs.lever.co': 'Lever',
  'jobs.eu.lever.co': 'Lever',
  'jobs.ashbyhq.com': 'Ashby',
};

const titleCase = (s: string) => s.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** A readable title derived from a URL when no label is set. */
export function prettyTitle(u: string): string {
  try {
    const url = new URL(/^https?:\/\//i.test(u) ? u : 'https://' + u);
    const host = url.hostname.replace(/^www\./, '');
    const segments = url.pathname.split('/').filter(Boolean);
    // On a job board the host names the ATS, not the employer, so lead with the company slug.
    const ats = ATS_HOSTS[host];
    const company = ats && segments[0] ? titleCase(decodeURIComponent(segments[0])) : '';
    // Generic host labels name a kind of page, not the employer (#350): skip leading
    // jobs/careers/boards/apply/www labels and use the next, company-ish label. A lone
    // TLD left after them is not a brand either — fall back to the path words below.
    const GENERIC_HOST_LABELS = new Set(['jobs', 'careers', 'boards', 'apply', 'www']);
    const labels = host.split('.');
    let li = 0;
    while (li < labels.length && GENERIC_HOST_LABELS.has(labels[li])) li++;
    const brandLabel =
      li < labels.length - 1 ? labels[li] : li === 0 && labels.length === 1 ? labels[0] : '';
    const brand = brandLabel ? brandLabel.charAt(0).toUpperCase() + brandLabel.slice(1) : '';
    let title = company || brand;
    let words = decodeURIComponent((company ? segments.slice(1) : segments).pop() || '')
      .replace(/\.(html?|php|aspx)$/i, '')
      .replace(/[-_]+/g, ' ')
      .trim();
    // Skip ids and UUIDs (their hyphens are already spaces here).
    if (/^[0-9a-f -]{16,}$/i.test(words) || /^\d+$/.test(words)) words = '';
    if (company && words.toLowerCase() === 'jobs') words = '';
    if (words && words.length <= 42 && /[a-z]/i.test(words)) {
      words = words.replace(/\b\w/g, (c) => c.toUpperCase());
      title = title ? title + ' — ' + words : words;
    } else if (company) {
      title += ' · ' + ats;
    }
    return title || 'Saved job';
  } catch {
    return 'Saved job';
  }
}
/** The employer behind a company-board link (any ATS `parseBoardUrl` knows), title-cased from
 *  the board slug: boards.greenhouse.io/acme/jobs/77 → "Acme". Empty for any other link. */
export function companyFromUrl(u: string): string {
  const b = parseBoardUrl(u);
  return b ? prettySlug(b.slug) : '';
}
export function cleanUrl(u: string): string {
  u = (typeof u === 'string' ? u : '')
    // Control characters (a decoded %0D%0A) never stay in a link: `new URL` drops them silently,
    // so a check would pass while the stored text could still break a line in a .ics or CSV.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .replace(/[<>]/g, '')
    .replace(/^["'(\s]+/, '')
    .replace(/["')\s]+$/, '');
  while (/^https?:\/\/https?:\/\//i.test(u)) u = u.replace(/^https?:\/\//i, '');
  return u;
}
/** A pasted link as the store keeps it: cleaned, with https:// when it has no scheme. */
function normalizeJobUrl(rawUrl: string): string {
  const u = cleanUrl(rawUrl);
  return u && !/^https?:\/\//i.test(u) ? 'https://' + u : u;
}
export function dedupKey(u: string): string {
  // Cached (2026-11-07 phone profile: the Feed keyed every posting's URL on every repaint).
  const hit = dedupCache.get(u);
  if (hit !== undefined) return hit;
  const key = computeDedupKey(u);
  if (dedupCache.size > DEDUP_CACHE_MAX) dedupCache.clear();
  dedupCache.set(u, key);
  return key;
}
const DEDUP_CACHE_MAX = 20_000;
const dedupCache = new Map<string, string>();

function computeDedupKey(u: string): string {
  try {
    const x = new URL(u);
    const h = x.hostname.replace(/^www\./, '').toLowerCase();
    const path = x.pathname.replace(/\/+$/, '').toLowerCase();
    const drop = /^(utm_|fbclid$|gclid$|mc_|ref$|src$|source$|trk$|gh_src$)/i;
    const ps: string[] = [];
    x.searchParams.forEach((v, k) => {
      if (!drop.test(k)) ps.push(k.toLowerCase() + '=' + v);
    });
    ps.sort();
    return h + path + (ps.length ? '?' + ps.join('&') : '');
  } catch {
    return (u || '').toLowerCase().replace(/\/+$/, '');
  }
}

const FNV_OFFSET = 0x811c9dc5; // the standard FNV-1a offset basis
const FNV_OFFSET_ALT = 0x050c5d1f; // a second basis, so two independent 32-bit hashes make one id

/** FNV-1a over a string with a given offset basis (32-bit). */
function fnv1a(str: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** A job's stable, URL-safe id for its route (#/queue/<id>, #127). Job has no id field, and its URL
 *  can't go raw into the hash (`/ ? & =`), so the id is a 2×32-bit hash of the same dedup key the
 *  store uses — URLs the store treats as one job get one id. Never stored; always derived. */
export function jobIdOf(url: string): string {
  const key = dedupKey(url);
  return fnv1a(key, FNV_OFFSET).toString(36) + fnv1a(key, FNV_OFFSET_ALT).toString(36);
}

/** Normalize any incoming list (localStorage OR cloud): clean URLs/labels,
 *  drop retired/blank, backfill weak titles, de-dupe by URL. Idempotent. */
export function sanitizeJobs(arr: unknown): Job[] {
  if (!Array.isArray(arr)) return [];
  const out: Job[] = [];
  const seen = new Set<string>();
  for (const it of arr as Job[]) {
    // A tampered blob or backup can hold anything: a job that is not an object with a string
    // link is dropped, never thrown on (a throw here stops restore and every sync merge).
    if (!it || typeof it !== 'object' || typeof it.url !== 'string' || !it.url) continue;
    const url = cleanUrl(it.url);
    // A synced or restored job's link becomes an href: `javascript:` / `data:` never load.
    if (!url || RETIRED[url] || !safeJobUrl(url)) continue;
    const key = dedupKey(url);
    if (seen.has(key)) continue; // first occurrence wins
    seen.add(key);
    const label = (typeof it.label === 'string' ? it.label : '').replace(/[<>]/g, '').trim();
    const {
      snoozeUntil: rawSnooze,
      decks: rawDecks,
      docLinks: rawDocLinks,
      deadline: rawDeadline,
      postedAt: _p,
      discoveredAt: _d,
      savedAt: _s,
      closedAt: _c,
      location: rawLocation,
      ...rest
    } = it;
    const snoozeUntil = normSnooze(rawSnooze);
    // Deck links become hrefs: only well-formed http(s) ones are kept (#287).
    const decks = sanitizeDecks(rawDecks);
    const docLinks = sanitizeDecks(rawDocLinks); // the same rule for document links (#416)
    const deadline = normSnooze(rawDeadline); // the same YYYY-MM-DD rule
    const location = cleanPlace(rawLocation); // "N/A" and friends are no location
    out.push(
      normalizeScreening({
        ...rest,
        ...(snoozeUntil ? { snoozeUntil } : {}),
        ...(decks.length ? { decks } : {}),
        ...(docLinks.length ? { docLinks } : {}),
        ...(deadline ? { deadline } : {}),
        ...(location ? { location } : {}),
        ...normJobDates(it),
        url,
        status: normStatus(it.status),
        label: label && label !== 'Saved job' ? label : prettyTitle(url), // backfill weak titles
      }),
    );
  }
  return out;
}
function load(): Job[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw == null) return [];
    return sanitizeJobs(JSON.parse(raw));
  } catch {
    return [];
  }
}

// ---- external store (shared across views) ----
const store = createStore<Job[]>(load(), {
  onSet: (next) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  },
});
const set = store.set;

/** Listen for job changes outside React. */
export const subscribeJobs = (cb: () => void) => store.subscribe(cb);

export function useJobs(): Job[] {
  return store.use();
}

/** Add a job; returns true if newly added, false if it already existed. An optional
 *  `note` seeds the new Job's note (used by tile saves to carry the tile's description
 *  into the queue card — issue #57 "enriched save"). Ignored when the job already exists,
 *  so a re-save never clobbers the user's own notes. */
/** What a quick save did: a new job, a set-aside one brought back, one already in the Pipeline,
 *  or nothing for a link that isn't one (#219: callers tell the user about the first two). */
export type AddOutcome = 'added' | 'restored' | 'exists' | 'invalid';

export function addJobOutcome(rawUrl: string, label?: string, note?: string): AddOutcome {
  const jobs = store.get();
  const u = normalizeJobUrl(rawUrl);
  if (!u || !/\./.test(u)) return 'invalid';
  const key = dedupKey(u);
  const i = jobs.findIndex((j) => dedupKey(j.url) === key);
  if (i > -1) {
    if (!jobs[i].archived) return 'exists';
    const c = [...jobs];
    c[i] = { ...c[i], archived: false };
    set(c);
    return 'restored';
  }
  const job: Job = {
    url: u,
    label: (label || '').trim() || prettyTitle(u),
    status: 'Saved',
    savedAt: new Date().toISOString(),
  };
  const company = companyFromUrl(u);
  if (company) job.company = company;
  if (note?.trim()) job.note = note.trim();
  set([...jobs, job]);
  return 'added';
}

/** Add a job; true only when it is new (a set-aside one is brought back, but returns false). */
export const addJob = (rawUrl: string, label?: string, note?: string): boolean =>
  addJobOutcome(rawUrl, label, note) === 'added';
/** Add a job with extra fields in one shot (used by Live postings save). Returns the stored
 *  (normalized) URL when newly added, or null if it already existed — in which case
 *  the existing entry is left untouched so we never clobber the user's own notes. */
export function addJobDetailed(
  rawUrl: string,
  fields: {
    label?: string;
    salary?: string;
    note?: string;
    /** The job's Notes (the one Notes field), e.g. a Daily pick's draft note. */
    notes?: string;
    company?: string;
    location?: string;
    seniority?: string;
    mode?: JobMode;
    deadline?: string;
    postedAt?: string;
    discoveredAt?: string;
  },
): string | null {
  const jobs = store.get();
  const u = normalizeJobUrl(rawUrl);
  if (!u || !/\./.test(u)) return null;
  const key = dedupKey(u);
  if (jobs.some((j) => dedupKey(j.url) === key)) return null; // already saved
  const job: Job = {
    url: u,
    label: (fields.label || '').trim() || prettyTitle(u),
    status: 'Saved',
  };
  const postedAt = normDate(fields.postedAt);
  if (postedAt) job.postedAt = postedAt;
  const discoveredAt = normDate(fields.discoveredAt);
  if (discoveredAt) job.discoveredAt = discoveredAt;
  job.savedAt = new Date().toISOString();
  if (fields.salary?.trim()) job.salary = fields.salary.trim();
  if (fields.note?.trim()) job.note = fields.note.trim();
  if (fields.notes?.trim()) job.notes = fields.notes.trim();
  const company = fields.company?.trim() || companyFromUrl(u);
  if (company) job.company = company;
  const location = cleanPlace(fields.location);
  if (location) job.location = location;
  if (fields.seniority?.trim()) job.seniority = fields.seniority.trim();
  if (fields.mode) job.mode = fields.mode;
  const deadline = normSnooze(fields.deadline);
  if (deadline) job.deadline = deadline;
  set([...jobs, job]);
  return u;
}
/** Record a follow-up sent today (restarts the follow-up countdown). */
export function logFollowUp(url: string) {
  const jobs = store.get();
  set(jobs.map((j) => (j.url === url ? applyFollowUp(j) : j)));
}
/** Hold a due follow-up back a few days without recording one. */
export function snoozeFollowUp(url: string) {
  const jobs = store.get();
  set(jobs.map((j) => (j.url === url ? applySnooze(j) : j)));
}
/** Undo a follow-up send or snooze: put back the job's follow-up clock as it was in `before`. */
export function restoreFollowUp(url: string, before: Pick<Job, 'followUp' | 'snoozeUntil'>) {
  const jobs = store.get();
  set(
    jobs.map((j) => {
      if (j.url !== url) return j;
      const { followUp: _f, snoozeUntil: _s, ...rest } = j;
      return {
        ...rest,
        ...(before.followUp ? { followUp: before.followUp } : {}),
        ...(before.snoozeUntil ? { snoozeUntil: before.snoozeUntil } : {}),
      };
    }),
  );
}
export function updateJob(url: string, patch: Partial<Job>) {
  const jobs = store.get();
  set(jobs.map((j) => (j.url === url ? { ...j, ...patch } : j)));
}
export function setStatus(url: string, status: Status) {
  const jobs = store.get();
  set(jobs.map((j) => (j.url === url ? applyStatus(j, status) : j)));
}
/** Point a job at a new link. Returns the stored URL, or null when the link is not a URL or
 *  another saved job already has it (the job keeps its old link). */
export function setJobUrl(url: string, rawNext: string): string | null {
  const next = normalizeJobUrl(rawNext);
  if (!next || !/\./.test(next)) return null;
  const key = dedupKey(next);
  const jobs = store.get();
  if (jobs.some((j) => j.url !== url && dedupKey(j.url) === key)) return null;
  set(jobs.map((j) => (j.url === url ? { ...j, url: next } : j)));
  return next;
}
/** Set or clear the day applications close (#419: the job page's "Applications close"). */
export function setJobDeadline(url: string, raw: string) {
  const deadline = normSnooze(raw);
  const jobs = store.get();
  set(
    jobs.map((j) => {
      if (j.url !== url) return j;
      const { deadline: _d, ...rest } = j;
      return deadline ? { ...rest, deadline } : rest;
    }),
  );
}
/** Put a board check's answers on the saved jobs: `closedAt` when a posting is gone (#419). */
export function recordBoardChecks(results: ReadonlyMap<string, LiveCheck>) {
  const jobs = store.get();
  const next = recordLiveness(jobs, results);
  if (next !== jobs) set(next);
}
/** Delete a job outright. The UI removes through trash.ts (Recently removed) instead. */
export function removeJob(url: string) {
  const jobs = store.get();
  set(jobs.filter((j) => j.url !== url));
}
export function isSaved(url: string): boolean {
  const key = dedupKey(cleanUrl(url));
  return store.get().some((j) => dedupKey(j.url) === key);
}

/** The saved job a pasted link points at (cleaned the way addJob cleans it), or undefined. */
export function findJobByUrl(rawUrl: string): Job | undefined {
  const key = dedupKey(normalizeJobUrl(rawUrl));
  return store.get().find((j) => dedupKey(j.url) === key);
}

/** The saved job a route's id points at, or undefined (unknown, removed, or not synced yet). */
export function findJobById(id: string, jobs: Job[] = getAllJobs()): Job | undefined {
  return jobs.find((j) => jobIdOf(j.url) === id);
}

// Used by the cloud-sync layer to read/replace the whole list.
export function getAllJobs(): Job[] {
  return store.get();
}
export function replaceAll(next: Job[]) {
  set(sanitizeJobs(next));
}
/** Merge cloud + local jobs by URL (local order kept, cloud wins). Used by the sync layer. */
export const mergeJobs = (cloud: Job[] | null, local: Job[]): Job[] =>
  mergeByKey((j) => j.url, cloud, local);

/** Quick-link helper: add the job (if new) then set a status. */
export function setStatusByUrl(rawUrl: string, status: Status, label?: string) {
  addJob(rawUrl, label);
  // The saved copy may be under another form of the link (www, a trailing slash): match as a save
  // dedupes, not on the exact text.
  const job = findJobByUrl(rawUrl);
  if (job) setStatus(job.url, status);
}
export function markAppliedByUrl(rawUrl: string, label?: string) {
  setStatusByUrl(rawUrl, 'Applied', label);
}
