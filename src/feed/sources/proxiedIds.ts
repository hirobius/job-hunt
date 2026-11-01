// The boards read through /api/boards, and the shape of their adapters. No imports with runtime
// code, so the edge function (boardsHandler.ts) and the browser half (proxied.ts) can both use it
// without pulling the other's world into their bundle.
import type { FeedSourceId, Posting } from '../types';

/** Add a board here, in FeedSourceId/SOURCE_LABEL, in SOURCE_ENABLED (fetchFeed.ts) and in the
 *  function's registry (BOARD_ADAPTERS, boardsHandler.ts). */
export const PROXIED_SOURCES = [
  'dsjobs',
  'wwr',
  'workingnomads',
  'himalayas',
  'authenticjobs',
] as const satisfies readonly FeedSourceId[];
export type ProxiedId = (typeof PROXIED_SOURCES)[number];

/** The ones with a search endpoint: the term goes upstream (boardsHandler.test.ts checks each
 *  adapter's `search` agrees). The rest are read whole, once per search. */
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

/** Search terms longer than this are not sent upstream (also the function's limit). */
export const MAX_Q = 60;

export const isProxiedId = (s: string): s is ProxiedId =>
  (PROXIED_SOURCES as readonly string[]).includes(s);
