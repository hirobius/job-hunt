// Mastodon — public hashtag timelines on two big instances (keyless, CORS-open), for employers
// posting design-systems roles. UNVERIFIED LIVE: written from the documented REST shape; this build
// environment cannot reach either instance. An instance that turns off logged-out timelines
// answers 401/422, which shows as that source's failure, never a blank feed.
//   GET https://<instance>/api/v1/timelines/tag/<tag>?any[]=…&limit=40
//   →  [{ id, uri, url, created_at, content (HTML), account: { acct, display_name }, reblog }]
// Terms we honour (each instance's server rules + Mastodon's API docs): public statuses only, no
// sign-in; every row links to the status on its home server and names its author (attribution);
// source label "Mastodon". Rate limit: 300 requests per 5 minutes per IP; one search here is at
// most 2 tags × INSTANCES requests, cached an hour in memory (fetchFeed). The same post seen on both
// instances is kept once (by its ActivityPub `uri`). Only employer posts are kept (social.ts).
import { htmlToText } from '../html';
import { httpUrl } from '../../httpUrl';
import type { Posting } from '../types';
import { arr, obj, str, type FetchJson } from './http';
import { isHiringPost, postTitle, termTag } from './social';

/** The general instance and the big tech one. Each also lists federated posts it has seen. */
export const MASTODON_INSTANCES = ['https://mastodon.social', 'https://hachyderm.io'];
const LIMIT = 40;
/** Fediverse job tags; posts under them are then matched on the term downstream (match.ts). */
const HIRING_TAGS = ['hiring', 'jobs', 'getfedihired'];

const tagUrl = (instance: string, [tag, ...any]: string[]) =>
  `${instance}/api/v1/timelines/tag/${encodeURIComponent(tag)}?${any
    .map((t) => `any%5B%5D=${encodeURIComponent(t)}&`)
    .join('')}limit=${LIMIT}`;

/** The requests one search makes: the job tags, and the term's own tag (#designsystems) when it
 *  has one, on every instance. */
export function mastodonUrls(term: string): string[] {
  const tag = termTag(term);
  const sets = [HIRING_TAGS, ...(tag ? [tag.endsWith('s') ? [tag, tag.slice(0, -1)] : [tag]] : [])];
  return MASTODON_INSTANCES.flatMap((i) => sets.map((s) => tagUrl(i, s)));
}

export function parseMastodonStatus(s: unknown): Posting | null {
  const outer = obj(s);
  const o = outer.reblog ? obj(outer.reblog) : outer;
  const uri = str(o.uri);
  const url = httpUrl(str(o.url) || uri);
  const text = htmlToText(str(o.content)).trim();
  if (!uri || !url || !text || !isHiringPost(text)) return null;
  const account = obj(o.account);
  const name = str(account.display_name).trim();
  return {
    id: `mastodon:${uri}`,
    source: 'mastodon',
    title: postTitle(text),
    company: '',
    url,
    location: '',
    postedAt: str(o.created_at) || undefined,
    text: `Posted on Mastodon by ${name ? `${name} ` : ''}@${str(account.acct)}\n${text}`,
  };
}

export async function fetchMastodon(term: string, fetchJson: FetchJson): Promise<Posting[]> {
  if (!term.trim()) return [];
  // One instance or tag failing still leaves the others; all failing is the source's failure.
  const pages = await Promise.allSettled(mastodonUrls(term).map((u) => fetchJson(u)));
  const ok = pages.flatMap((p) => (p.status === 'fulfilled' ? [p.value] : []));
  if (!ok.length && pages[0]?.status === 'rejected') throw pages[0].reason;
  const seen = new Set<string>();
  return ok
    .flatMap((b) => arr(b).map(parseMastodonStatus))
    .filter((p): p is Posting => !!p && !seen.has(p.id) && !!seen.add(p.id));
}
