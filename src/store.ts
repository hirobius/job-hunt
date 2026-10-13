import { createStore } from './createStore';
import { mergeByKey } from './mergeByKey';
import { type Job, type JobMode, type Status } from './types';
import { applyStatus, logFollowUp as applyFollowUp, normStatus } from './jobState';
import { normalizeScreening } from './screening';

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
/** A readable title derived from a URL when no label is set. */
export function prettyTitle(u: string): string {
  try {
    const url = new URL(/^https?:\/\//i.test(u) ? u : 'https://' + u);
    const host = url.hostname.replace(/^www\./, '');
    const brand = host.split('.')[0];
    let title = brand.charAt(0).toUpperCase() + brand.slice(1);
    let words = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || '')
      .replace(/\.(html?|php|aspx)$/i, '')
      .replace(/[-_]+/g, ' ')
      .trim();
    if (/^[0-9a-f-]{16,}$/i.test(words) || /^\d+$/.test(words)) words = ''; // skip ids/uuids
    if (words && words.length <= 42 && /[a-z]/i.test(words)) {
      words = words.replace(/\b\w/g, (c) => c.toUpperCase());
      title += ' — ' + words;
    }
    return title;
  } catch {
    return 'Saved job';
  }
}
/** Compact host+path for the secondary line. */
export function shortUrl(u: string): string {
  try {
    const url = new URL(u);
    const s =
      url.hostname.replace(/^www\./, '') +
      (url.pathname && url.pathname !== '/' ? url.pathname : '');
    return s.length > 52 ? s.slice(0, 51) + '…' : s;
  } catch {
    return u;
  }
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
    out.push(
      normalizeScreening({
        ...it,
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

export function useJobs(): Job[] {
  return store.use();
}

/** Add a job; returns true if newly added, false if it already existed. An optional
 *  `note` seeds the new Job's note (used by tile saves to carry the tile's description
 *  into the queue card — issue #57 "enriched save"). Ignored when the job already exists,
 *  so a re-save never clobbers the user's own notes. */
export function addJob(rawUrl: string, label?: string, note?: string): boolean {
  const jobs = store.get();
  let u = cleanUrl(rawUrl);
  if (!u) return false;
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  if (!/\./.test(u)) return false;
  const key = dedupKey(u);
  const i = jobs.findIndex((j) => dedupKey(j.url) === key);
  if (i > -1) {
    if (jobs[i].archived) {
      const c = [...jobs];
      c[i] = { ...c[i], archived: false };
      set(c);
    }
    return false;
  }
  const job: Job = { url: u, label: (label || '').trim() || prettyTitle(u), status: 'Saved' };
  if (note?.trim()) job.note = note.trim();
  set([...jobs, job]);
  return true;
}
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
  let u = cleanUrl(rawUrl);
  if (!u) return null;
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  if (!/\./.test(u)) return null;
  const key = dedupKey(u);
  if (jobs.some((j) => dedupKey(j.url) === key)) return null; // already saved
  const job: Job = {
    url: u,
    label: (fields.label || '').trim() || prettyTitle(u),
    status: 'Saved',
  };
  if (fields.salary?.trim()) job.salary = fields.salary.trim();
  if (fields.note?.trim()) job.note = fields.note.trim();
  if (fields.company?.trim()) job.company = fields.company.trim();
  if (fields.location?.trim()) job.location = fields.location.trim();
  if (fields.seniority?.trim()) job.seniority = fields.seniority.trim();
  if (fields.mode) job.mode = fields.mode;
  set([...jobs, job]);
  return u;
}
/** Log a follow-up today (restarts the follow-up countdown). */
export function logFollowUp(url: string) {
  const jobs = store.get();
  set(jobs.map((j) => (j.url === url ? applyFollowUp(j) : j)));
}
export function updateJob(url: string, patch: Partial<Job>) {
  const jobs = store.get();
  set(jobs.map((j) => (j.url === url ? { ...j, ...patch } : j)));
}
export function setStatus(url: string, status: Status) {
  const jobs = store.get();
  set(jobs.map((j) => (j.url === url ? applyStatus(j, status) : j)));
}
export function removeJob(url: string) {
  const jobs = store.get();
  set(jobs.filter((j) => j.url !== url));
}
export function isSaved(url: string): boolean {
  const key = dedupKey(cleanUrl(url));
  return store.get().some((j) => dedupKey(j.url) === key);
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
