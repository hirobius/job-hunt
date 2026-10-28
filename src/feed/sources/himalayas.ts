// Himalayas — remote jobs, with a public keyless JSON API (UNVERIFIED LIVE: written from the shape
// third-party readers describe; this build environment cannot reach himalayas.app).
//   GET https://himalayas.app/jobs/api/search?q=<term>
//   →  { jobs: [ { title, companyName, description (HTML), excerpt, employmentType, minSalary,
//                  maxSalary, currency, locationRestrictions[], pubDate (unix seconds),
//                  applicationLink, guid } ], ... }
// A search source: the term goes upstream (through /api/boards, cached an hour per term).
// Terms, as reported (not read first-hand): link back to himalayas.app and name Himalayas as the
// source (every row does: its own Himalayas link, "Himalayas" label), and do NOT redistribute the
// jobs to other job boards, aggregators or job search engines. The app shows them to the one
// person searching and never republishes them, but that reading needs checking against the live
// terms first, so this source is OFF by default (SOURCE_ENABLED.himalayas).
import { htmlToText } from '../html';
import { httpUrl } from '../../httpUrl';
import type { Posting } from '../types';
import { arr, num, obj, str } from './http';
import { MAX_Q, type ProxiedSource } from './proxied';

export const himalayasUrl = (q: string) =>
  `https://himalayas.app/jobs/api/search?q=${encodeURIComponent(q.trim().slice(0, MAX_Q))}`;

export function parseHimalayasJob(j: unknown): Posting | null {
  const o = obj(j);
  // Their attribution asks for a link to Himalayas: the job's Himalayas page (guid) first.
  const url = httpUrl(str(o.guid)) ?? httpUrl(str(o.applicationLink));
  if (!url) return null;
  const places = arr(o.locationRestrictions)
    .map((l) => (typeof l === 'string' ? l : str(obj(l).name)))
    .filter(Boolean);
  const seconds = num(o.pubDate);
  const type = str(o.employmentType);
  const min = num(o.minSalary);
  const max = num(o.maxSalary);
  const p: Posting = {
    id: `himalayas:${url}`,
    source: 'himalayas',
    title: str(o.title),
    company: str(o.companyName),
    url,
    location: places.join(', '),
    mode: 'remote',
    postedAt: seconds ? new Date(seconds * 1000).toISOString() : undefined,
    text: [type && `Job type: ${type}`, htmlToText(str(o.description) || str(o.excerpt))]
      .filter(Boolean)
      .join('\n'),
  };
  if (min !== undefined) p.salaryMin = min;
  if (max !== undefined) p.salaryMax = max;
  if ((min !== undefined || max !== undefined) && str(o.currency)) p.currency = str(o.currency);
  return p;
}

export function parseHimalayas(body: string): Posting[] {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return [];
  }
  return arr(obj(json).jobs)
    .map(parseHimalayasJob)
    .filter((p): p is Posting => !!p);
}

export const himalayas: ProxiedSource = {
  id: 'himalayas',
  search: true,
  upstream: (q = '') => (q.trim() ? [himalayasUrl(q)] : []),
  parse: parseHimalayas,
};
