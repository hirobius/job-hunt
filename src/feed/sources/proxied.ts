// Job boards read through the app's own /api/boards function (src/feed/sources/boardsHandler.ts)
// rather than straight from the browser: their feeds are RSS or JSON without CORS headers, so a
// browser on our origin can't read them. The function fetches a FIXED upstream URL per source (it is
// never an open proxy), parses it with the source's adapter, and answers `{ postings }` with an hour
// of shared CDN cache, so every user together polls each board about once an hour. Because the
// browser only ever talks to 'self', the CSP and legal.ts THIRD_PARTIES are unchanged.
//
// This file is the browser half: the request and a strict re-check of what came back. The adapters
// (one file per board) are only imported by the function, so their parsers stay out of the app
// bundle. Postings come back unfiltered, like a watched board: the feed's phrase rule (rankPostings)
// or, on a scored track, the scorer decides what is listed.
import { httpUrl } from '../../httpUrl';
import type { Posting } from '../types';
import { arr, num, obj, str, type FetchJson } from './http';
import { MAX_Q, PROXIED_SEARCH, type ProxiedId } from './proxiedIds';

export const PROXY_PATH = '/api/boards';

export function proxyUrl(id: ProxiedId, q?: string): string {
  const p = new URLSearchParams({ src: id });
  if (q) p.set('q', q.trim().slice(0, MAX_Q));
  return `${PROXY_PATH}?${p}`;
}

/** The function's answer, re-checked field by field: only this source's ids, only http(s) links,
 *  only strings and positive numbers. Anything else is dropped, never trusted. */
export function postingsFrom(body: unknown, id: ProxiedId): Posting[] {
  const out: Posting[] = [];
  for (const raw of arr(obj(body).postings)) {
    const o = obj(raw);
    const pid = str(o.id);
    const url = httpUrl(str(o.url));
    if (!pid.startsWith(`${id}:`) || !url) continue;
    const mode = str(o.mode);
    const p: Posting = {
      id: pid,
      source: id,
      title: str(o.title),
      company: str(o.company),
      url,
      location: str(o.location),
      text: str(o.text),
    };
    if (mode === 'remote' || mode === 'hybrid' || mode === 'onsite') p.mode = mode;
    if (str(o.postedAt) && !Number.isNaN(Date.parse(str(o.postedAt)))) p.postedAt = str(o.postedAt);
    const min = num(o.salaryMin);
    const max = num(o.salaryMax);
    if (min !== undefined) p.salaryMin = min;
    if (max !== undefined) p.salaryMax = max;
    if ((min !== undefined || max !== undefined) && /^[A-Z]{3}$/.test(str(o.currency)))
      p.currency = str(o.currency);
    out.push(p);
  }
  return out;
}

/** One request per URL at a time (a sweep reads a search board once per term, all at once). */
const inFlight = new WeakMap<FetchJson, Map<string, Promise<unknown>>>();
/** URLs whose last answer was partial (one of a board's feeds failed upstream): the next read
 *  skips the session cache, which would otherwise keep the gap for an hour. */
const partial = new Set<string>();

function readOnce(url: string, fetchJson: FetchJson): Promise<unknown> {
  let m = inFlight.get(fetchJson);
  if (!m) inFlight.set(fetchJson, (m = new Map()));
  const hit = m.get(url);
  if (hit) return hit;
  const p = fetchJson(url, partial.has(url) ? { fresh: true } : undefined)
    .then((body) => {
      if (obj(body).partial === true) partial.add(url);
      else partial.delete(url);
      return body;
    })
    .finally(() => m.delete(url));
  m.set(url, p);
  return p;
}

/** A board's postings. A search board (PROXIED_SEARCH) sends `term` upstream; the rest are read
 *  whole and ignore it. */
export async function fetchProxied(
  id: ProxiedId,
  fetchJson: FetchJson,
  term?: string,
): Promise<Posting[]> {
  const q = PROXIED_SEARCH.has(id) ? term?.trim() : undefined;
  if (PROXIED_SEARCH.has(id) && !q) return [];
  return postingsFrom(await readOnce(proxyUrl(id, q), fetchJson), id);
}
