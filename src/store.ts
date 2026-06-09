import { useCallback, useEffect, useState } from 'react';
import { STATUSES, type Job, type Status } from './types';

const KEY = 'rjb_shortlist'; // same key as the legacy app, so existing data carries over
const RETIRED: Record<string, 1> = {
  'https://jobs.lever.co/entrata/aa9f605b-8360-416d-94fc-ed5d5a68602c': 1, // Entrata: no WA hiring
};

export function hostOf(u: string): string {
  try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; }
}
export function normStatus(s?: string): Status {
  return (STATUSES as string[]).indexOf(s || '') > -1 ? (s as Status) : 'Saved';
}
export function cleanUrl(u: string): string {
  u = (u || '').trim().replace(/[<>]/g, '').replace(/^["'(\s]+/, '').replace(/["')\s]+$/, '');
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
    x.searchParams.forEach((v, k) => { if (!drop.test(k)) ps.push(k.toLowerCase() + '=' + v); });
    ps.sort();
    return h + path + (ps.length ? '?' + ps.join('&') : '');
  } catch {
    return (u || '').toLowerCase().replace(/\/+$/, '');
  }
}
function today(): string {
  const d = new Date(); const p = (n: number) => (n < 10 ? '0' : '') + n;
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function load(): Job[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw == null) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((it: Job) => it && it.url && !RETIRED[cleanUrl(it.url)])
      .map((it: Job) => ({ ...it, url: cleanUrl(it.url), status: normStatus(it.status) }));
  } catch { return []; }
}

export function useTracker() {
  const [jobs, setJobs] = useState<Job[]>(load);

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(jobs)); } catch { /* ignore */ }
  }, [jobs]);

  const add = useCallback((rawUrl: string, label?: string) => {
    let u = cleanUrl(rawUrl);
    if (!u) return;
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    if (!/\./.test(u)) return;
    setJobs((prev) => {
      const key = dedupKey(u);
      const i = prev.findIndex((j) => dedupKey(j.url) === key);
      if (i > -1) {
        if (prev[i].archived) { const c = [...prev]; c[i] = { ...c[i], archived: false }; return c; }
        return prev;
      }
      return [...prev, { url: u, label: (label || '').trim() || hostOf(u) || 'Saved job', status: 'Saved' }];
    });
  }, []);

  const update = useCallback((url: string, patch: Partial<Job>) => {
    setJobs((prev) => prev.map((j) => (j.url === url ? { ...j, ...patch } : j)));
  }, []);

  const setStatus = useCallback((url: string, status: Status) => {
    setJobs((prev) => prev.map((j) => {
      if (j.url !== url) return j;
      const n: Job = { ...j, status };
      if (status === 'Applied' && !n.applied) n.applied = today();
      return n;
    }));
  }, []);

  const remove = useCallback((url: string) => {
    setJobs((prev) => prev.filter((j) => j.url !== url));
  }, []);

  return { jobs, add, update, setStatus, remove };
}

export function daysSince(s?: string): number | null {
  if (!s) return null;
  const t = Date.parse(s);
  if (isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86400000);
}
