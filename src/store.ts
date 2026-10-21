import { createStore } from './createStore';
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
import { parseBoardUrl } from './feed/sources/ats';
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
    const brand = host.split('.')[0];
    let title = company || brand.charAt(0).toUpperCase() + brand.slice(1);
    let words = decodeURIComponent((company ? segments.slice(1) : segments).pop() || '')
      .replace(/\.(html?|php|aspx)$/i, '')
      .replace(/[-_]+/g, ' ')
      .trim();
    // Skip ids and UUIDs (their hyphens are already spaces here).
    if (/^[0-9a-f -]{16,}$/i.test(words) || /^\d+$/.test(words)) words = '';
    if (company && words.toLowerCase() === 'jobs') words = '';
    if (words && words.length <= 42 && /[a-z]/i.test(words)) {
      words = words.replace(/\b\w/g, (c) => c.toUpperCase());
      title += ' — ' + words;
    } else if (company) {
      title += ' · ' + ats;
    }
    return title;
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
  u = (u || '')
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
    if (!it || !it.url) continue;
    const url = cleanUrl(it.url);
    if (!url || RETIRED[url]) continue;
    const key = dedupKey(url);
    if (seen.has(key)) continue; // first occurrence wins
    seen.add(key);
    const label = (it.label || '').replace(/[<>]/g, '').trim();
    const { snoozeUntil: rawSnooze, ...rest } = it;
    const snoozeUntil = normSnooze(rawSnooze);
    out.push(
      normalizeScreening({
        ...rest,
        ...(snoozeUntil ? { snoozeUntil } : {}),
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
  const job: Job = { url: u, label: (label || '').trim() || prettyTitle(u), status: 'Saved' };
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
    company?: string;
    location?: string;
    seniority?: string;
    mode?: JobMode;
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
  if (fields.salary?.trim()) job.salary = fields.salary.trim();
  if (fields.note?.trim()) job.note = fields.note.trim();
  const company = fields.company?.trim() || companyFromUrl(u);
  if (company) job.company = company;
  if (fields.location?.trim()) job.location = fields.location.trim();
  if (fields.seniority?.trim()) job.seniority = fields.seniority.trim();
  if (fields.mode) job.mode = fields.mode;
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
  let u = cleanUrl(rawUrl);
  if (!u) return;
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  setStatus(u, status);
}
export function markAppliedByUrl(rawUrl: string, label?: string) {
  setStatusByUrl(rawUrl, 'Applied', label);
}
