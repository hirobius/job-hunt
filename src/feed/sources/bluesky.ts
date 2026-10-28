// Bluesky — public post search on the AppView (keyless, CORS-open), for employers posting design-
// systems roles. OFF (SOURCE_ENABLED.bluesky) and UNVERIFIED LIVE: written from the documented XRPC
// shape; this build environment cannot reach bsky.app, and the public AppView is reported to refuse
// logged-out searchPosts (403) since 2025. Turn it on once a deployed check answers 200; if it
// needs a session, that is an app password (a key: env BSKY_APP_PASSWORD, server-side only), not
// a browser read.
//   GET https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=…&sort=latest&limit=50
//   →  { posts: [{ uri, author: { handle, displayName }, record: { text, createdAt }, indexedAt }] }
// Terms we honour (Bluesky Terms of Service + developer guidelines): read public posts only, no
// sign-in, no repost or storage until the user saves one; every row links to the post itself on
// bsky.app and names its author (attribution), and the source label says "Bluesky". Rate limit:
// the public AppView allows 3,000 requests per 5 minutes per IP; one search here is
// QUERIES.length requests, cached an hour in memory (fetchFeed). Only employer posts are kept
// (social.ts `isHiringPost`); the term match itself is match.ts's job downstream.
import { httpUrl } from '../../httpUrl';
import type { Posting } from '../types';
import { arr, obj, str, type FetchJson } from './http';
import { isHiringPost, postTitle } from './social';

const API = 'https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts';
/** Each search pairs the term with one of these (Bluesky search has no OR). The term is not
 *  quoted: a quoted phrase drops plurals, and match.ts keeps only real phrase hits downstream. */
const QUERIES = ['hiring', 'job'];
const LIMIT = 50;

export const blueskySearchUrl = (term: string, extra: string) =>
  `${API}?q=${encodeURIComponent(`${term.replace(/"/g, '')} ${extra}`)}&sort=latest&limit=${LIMIT}`;

/** at://did:plc:abc/app.bsky.feed.post/3kxyz → https://bsky.app/profile/<handle>/post/3kxyz */
function postUrl(uri: string, handle: string): string | undefined {
  const m = /^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/([\w.~:-]+)$/.exec(uri);
  if (!m) return undefined;
  return httpUrl(`https://bsky.app/profile/${encodeURIComponent(handle || m[1])}/post/${m[2]}`);
}

export function parseBlueskyPost(p: unknown): Posting | null {
  const o = obj(p);
  const uri = str(o.uri);
  const author = obj(o.author);
  const record = obj(o.record);
  const text = str(record.text).trim();
  const handle = str(author.handle);
  const url = postUrl(uri, handle);
  if (!url || !text || !isHiringPost(text)) return null;
  const name = str(author.displayName).trim();
  return {
    id: `bluesky:${uri}`,
    source: 'bluesky',
    title: postTitle(text),
    company: '',
    url,
    location: '',
    postedAt: str(record.createdAt) || str(o.indexedAt) || undefined,
    text: `Posted on Bluesky by ${name ? `${name} ` : ''}@${handle}\n${text}`,
  };
}

export async function fetchBluesky(term: string, fetchJson: FetchJson): Promise<Posting[]> {
  const t = term.trim();
  if (!t) return [];
  // One query failing still leaves the other; both failing is the source's failure.
  const settled = await Promise.allSettled(QUERIES.map((q) => fetchJson(blueskySearchUrl(t, q))));
  const pages = settled.flatMap((p) => (p.status === 'fulfilled' ? [p.value] : []));
  if (!pages.length) throw (settled[0] as PromiseRejectedResult).reason;
  const seen = new Set<string>();
  return pages
    .flatMap((b) => arr(obj(b).posts).map(parseBlueskyPost))
    .filter((p): p is Posting => !!p && !seen.has(p.id) && !!seen.add(p.id));
}
