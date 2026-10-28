// Job boards read through the app's own /api/boards function (src/feed/sources/boardsHandler.ts)
// rather than straight from the browser: their feeds are RSS or JSON without CORS headers, so a
// browser on our origin can't read them. The function fetches a FIXED upstream URL per source (it is
// never an open proxy), parses it with the source's adapter, and answers `{ postings }` with an hour
// of shared CDN cache, so every user together polls each board about once an hour. Because the
// browser only ever talks to 'self', the CSP and legal.ts THIRD_PARTIES are unchanged (like /api/sam).
//
// This file is the browser half: the ids, the request, and a strict re-check of what came back.
// The adapters (one file per board) are only imported by the function, so their parsers stay out of
// the app bundle.
import { httpUrl } from '../../httpUrl';
import { matchTerm } from '../match';
import type { FeedSourceId, Posting } from '../types';
import { arr, num, obj, str, type FetchJson } from './http';

/** The boards read through /api/boards. Add one here, in FeedSourceId/SOURCE_LABEL, in
 *  SOURCE_ENABLED (fetchFeed.ts) and in the function's registry (boardsHandler.ts). */
export const PROXIED_SOURCES = [
  'dsjobs',
  'wwr',
  'workingnomads',
  'himalayas',
  'authenticjobs',
] as const satisfies readonly FeedSourceId[];
export type ProxiedId = (typeof PROXIED_SOURCES)[number];
/** The ones with a search endpoint: the term goes upstream (the adapter's `search` matches). */
export const PROXIED_SEARCH: ReadonlySet<ProxiedId> = new Set<ProxiedId>(['himalayas']);

/** What an adapter gives the function: where to read, and how to turn one answer into postings. */
export interface ProxiedSource {
  id: ProxiedId;
  /** Upstream URLs to read (all of them, merged). `q` is passed only to a `search` source. */
  upstream: (q?: string) => string[];
  /** The source has a search endpoint: the term goes upstream (and into the cache key). */
  search?: boolean;
  /** One upstream body (as text) → postings. Must not throw on junk: return []. */
  parse: (body: string, url: string) => Posting[];
}

export const PROXY_PATH = '/api/boards';
/** Search terms longer than this are not sent upstream (also the function's limit). */
export const MAX_Q = 60;

export const isProxiedId = (s: string): s is ProxiedId =>
  (PROXIED_SOURCES as readonly string[]).includes(s);

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

/** One request per URL at a time: a sweep asks every term at once, and each would otherwise miss
 *  the session cache (it fills only when the first answer lands). */
const inFlight = new WeakMap<FetchJson, Map<string, Promise<unknown>>>();

function readOnce(url: string, fetchJson: FetchJson): Promise<unknown> {
  let m = inFlight.get(fetchJson);
  if (!m) inFlight.set(fetchJson, (m = new Map()));
  const hit = m.get(url);
  if (hit) return hit;
  const p = fetchJson(url).finally(() => m.delete(url));
  m.set(url, p);
  return p;
}

/** A board's postings for one search term, by the feed's phrase rule (`matchTerm`: "design
 *  system" is never "system design"). A search source sends the term upstream as well. */
export async function fetchProxied(
  id: ProxiedId,
  term: string,
  fetchJson: FetchJson,
): Promise<Posting[]> {
  const body = await readOnce(proxyUrl(id, PROXIED_SEARCH.has(id) ? term : undefined), fetchJson);
  return postingsFrom(body, id).filter((p) => matchTerm(p, term) !== null);
}
