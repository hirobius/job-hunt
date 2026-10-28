// Bluesky — public post search on the AppView (keyless, CORS-open), for employers posting design-
// systems roles. UNVERIFIED LIVE: written from the documented XRPC shape; this build environment
// cannot reach bsky.app.
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
/** Each search pairs the quoted term with one of these (Bluesky search has no OR). */
const QUERIES = ['hiring', 'job'];
const LIMIT = 50;

export const blueskySearchUrl = (term: string, extra: string) =>
  `${API}?q=${encodeURIComponent(`"${term.replace(/"/g, '')}" ${extra}`)}&sort=latest&limit=${LIMIT}`;

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
  const pages = await Promise.all(QUERIES.map((q) => fetchJson(blueskySearchUrl(t, q))));
  const seen = new Set<string>();
  return pages
    .flatMap((b) => arr(obj(b).posts).map(parseBlueskyPost))
    .filter((p): p is Posting => !!p && !seen.has(p.id) && !!seen.add(p.id));
}
