import { useSyncExternalStore } from 'react';
import { STATUSES, type Job, type Status } from './types';

const KEY = 'rjb_shortlist'; // same key as the legacy app
const RETIRED: Record<string, 1> = {
  'https://jobs.lever.co/entrata/aa9f605b-8360-416d-94fc-ed5d5a68602c': 1,
};

export function hostOf(u: string): string {
  try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; }
}
/** A readable title derived from a URL when no label is set. */
export function prettyTitle(u: string): string {
  try {
    const url = new URL(/^https?:\/\//i.test(u) ? u : 'https://' + u);
    const host = url.hostname.replace(/^www\./, '');
    const brand = host.split('.')[0];
    let title = brand.charAt(0).toUpperCase() + brand.slice(1);
    let words = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || '')
      .replace(/\.(html?|php|aspx)$/i, '').replace(/[-_]+/g, ' ').trim();
    if (/^[0-9a-f-]{16,}$/i.test(words) || /^\d+$/.test(words)) words = ''; // skip ids/uuids
    if (words && words.length <= 42 && /[a-z]/i.test(words)) {
      words = words.replace(/\b\w/g, (c) => c.toUpperCase());
      title += ' — ' + words;
    }
    return title;
  } catch { return 'Saved job'; }
}
/** Compact host+path for the secondary line. */
export function shortUrl(u: string): string {
  try {
    const url = new URL(u);
    const s = url.hostname.replace(/^www\./, '') + (url.pathname && url.pathname !== '/' ? url.pathname : '');
    return s.length > 52 ? s.slice(0, 51) + '…' : s;
  } catch { return u; }
}
export function normStatus(s?: string): Status {
  return (STATUSES as string[]).indexOf(s || '') > -1 ? (s as Status) : 'Saved';
}
export function cleanUrl(u: string): string {
  u = (u || '').trim().replace(/[<>]/g, '').replace(/^["'(\s]+/, '').replace(/["')\s]+$/, '');
  while (/^https?:\/\/https?:\/\//i.test(u)) u = u.replace(/^https?:\/\//i, '');
  return u;
}
function dedupKey(u: string): string {
  try {
    const x = new URL(u);
    const h = x.hostname.replace(/^www\./, '').toLowerCase();
    const path = x.pathname.replace(/\/+$/, '').toLowerCase();
    const drop = /^(utm_|fbclid$|gclid$|mc_|ref$|src$|source$|trk$|gh_src$)/i;
    const ps: string[] = [];
    x.searchParams.forEach((v, k) => { if (!drop.test(k)) ps.push(k.toLowerCase() + '=' + v); });
    ps.sort();
    return h + path + (ps.length ? '?' + ps.join('&') : '');
  } catch { return (u || '').toLowerCase().replace(/\/+$/, ''); }
}
function today(): string {
  const d = new Date(); const p = (n: number) => (n < 10 ? '0' : '') + n;
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
export function daysSince(s?: string): number | null {
  if (!s) return null;
  const t = Date.parse(s);
  return isNaN(t) ? null : Math.floor((Date.now() - t) / 86400000);
}
function load(): Job[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw == null) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((it: Job) => it && it.url && !RETIRED[cleanUrl(it.url)])
      .map((it: Job) => {
        const url = cleanUrl(it.url);
        return {
          ...it, url, status: normStatus(it.status),
          label: it.label && it.label !== 'Saved job' ? it.label : prettyTitle(url), // backfill weak titles
        };
      });
  } catch { return []; }
}

// ---- external store (shared across views) ----
let jobs: Job[] = load();
const listeners = new Set<() => void>();
function set(next: Job[]) {
  jobs = next;
  try { localStorage.setItem(KEY, JSON.stringify(jobs)); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}
function subscribe(cb: () => void) { listeners.add(cb); return () => { listeners.delete(cb); }; }
function snapshot() { return jobs; }

export function useJobs(): Job[] {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** Add a job; returns true if newly added, false if it already existed. */
export function addJob(rawUrl: string, label?: string): boolean {
  let u = cleanUrl(rawUrl);
  if (!u) return false;
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  if (!/\./.test(u)) return false;
  const key = dedupKey(u);
  const i = jobs.findIndex((j) => dedupKey(j.url) === key);
  if (i > -1) {
    if (jobs[i].archived) { const c = [...jobs]; c[i] = { ...c[i], archived: false }; set(c); }
    return false;
  }
  set([...jobs, { url: u, label: (label || '').trim() || prettyTitle(u), status: 'Saved' }]);
  return true;
}
/** Log a follow-up today (restarts the follow-up countdown). */
export function logFollowUp(url: string) { updateJob(url, { followUp: today() }); }
export function updateJob(url: string, patch: Partial<Job>) {
  set(jobs.map((j) => (j.url === url ? { ...j, ...patch } : j)));
}
export function setStatus(url: string, status: Status) {
  set(jobs.map((j) => {
    if (j.url !== url) return j;
    const n: Job = { ...j, status };
    if (status === 'Applied' && !n.applied) n.applied = today();
    return n;
  }));
}
export function removeJob(url: string) {
  set(jobs.filter((j) => j.url !== url));
}
export function isSaved(url: string): boolean {
  const key = dedupKey(cleanUrl(url));
  return jobs.some((j) => dedupKey(j.url) === key);
}

// Used by the cloud-sync layer to read/replace the whole list.
export function getAllJobs(): Job[] { return jobs; }
export function replaceAll(next: Job[]) { set(Array.isArray(next) ? next : []); }

/** Quick-link helper: add the job (if new) then mark it Applied. */
export function markAppliedByUrl(rawUrl: string, label?: string) {
  addJob(rawUrl, label);
  let u = cleanUrl(rawUrl);
  if (!u) return;
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  setStatus(u, 'Applied');
}
