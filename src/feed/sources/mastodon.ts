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
import { inferMode } from '../match';
import { httpUrl } from '../../httpUrl';
import type { Posting } from '../types';
import { arr, obj, str, type FetchJson } from './http';
import { isHiringPost, postMatchesTerm, postTitle, termTags } from './social';

/** The general instance and the big tech one. Each also lists federated posts it has seen. */
export const MASTODON_INSTANCES = ['https://mastodon.social', 'https://hachyderm.io'];
const LIMIT = 40;
/** Fediverse job tags; posts under them are kept only when they name the term (postMatchesTerm). */
const HIRING_TAGS = ['hiring', 'jobs', 'getfedihired'];

const tagUrl = (instance: string, [tag, ...any]: string[]) =>
  `${instance}/api/v1/timelines/tag/${encodeURIComponent(tag)}?${any
    .map((t) => `any%5B%5D=${encodeURIComponent(t)}&`)
    .join('')}limit=${LIMIT}`;

/** The requests one search makes: the job tags, and the term's own tag (#designsystems) when it
 *  has one, on every instance. */
export function mastodonUrls(term: string): string[] {
  const tags = termTags(term);
  const sets = [HIRING_TAGS, ...(tags.length ? [tags] : [])];
  return MASTODON_INSTANCES.flatMap((i) => sets.map((s) => tagUrl(i, s)));
}

/** The job-tag timelines do not depend on the term, so a sweep's terms share one read of each
 *  while it is in flight (the session cache in fetchFeed serves them after it lands). */
const inflight = new WeakMap<FetchJson, Map<string, Promise<unknown>>>();
function sharedRead(fetchJson: FetchJson, url: string): Promise<unknown> {
  let reads = inflight.get(fetchJson);
  if (!reads) inflight.set(fetchJson, (reads = new Map()));
  const known = reads.get(url);
  if (known) return known;
  const read = fetchJson(url).finally(() => reads.delete(url));
  reads.set(url, read);
  return read;
}
const isHiringTagUrl = (url: string) => url.includes(`/tag/${HIRING_TAGS[0]}?`);

const tagsOf = (s: unknown): string[] => {
  const outer = obj(s);
  const o = outer.reblog ? obj(outer.reblog) : outer;
  return arr(o.tags).map((t) => str(obj(t).name));
};

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
    mode: inferMode(postTitle(text)),
    postedAt: str(o.created_at) || undefined,
    text: `Posted on Mastodon by ${name ? `${name} ` : ''}@${str(account.acct)}\n${text}`,
  };
}

export async function fetchMastodon(term: string, fetchJson: FetchJson): Promise<Posting[]> {
  if (!term.trim()) return [];
  // One instance or tag failing still leaves the others; all failing is the source's failure.
  const pages = await Promise.allSettled(
    mastodonUrls(term).map((u) => (isHiringTagUrl(u) ? sharedRead(fetchJson, u) : fetchJson(u))),
  );
  const ok = pages.flatMap((p) => (p.status === 'fulfilled' ? [p.value] : []));
  if (!ok.length && pages[0]?.status === 'rejected') throw pages[0].reason;
  const seen = new Set<string>();
  return ok
    .flatMap((b) => arr(b).map((s) => ({ p: parseMastodonStatus(s), tags: tagsOf(s) })))
    .filter(({ p, tags }) => !!p && postMatchesTerm(p, tags, term.trim()))
    .map(({ p }) => p as Posting)
    .filter((p) => !seen.has(p.id) && !!seen.add(p.id));
}
