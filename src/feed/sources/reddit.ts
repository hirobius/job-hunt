// Reddit — hiring posts in r/DesignSystems, r/UXDesign and r/forhire. OFF (SOURCE_ENABLED.reddit in
// fetchFeed.ts) and UNVERIFIED LIVE: this build environment cannot reach reddit.com.
// Why it is off: Reddit's Data API Terms (2023) and Developer Terms require a registered app, OAuth
// and a descriptive User-Agent for any API use, and they cap unauthenticated reads (~10/min) as not
// licensed for apps. A browser cannot hold a client secret or set a User-Agent, so keyless reads
// from every user's browser are not allowed. To turn it on: register a free "script"/"web" app at
// reddit.com/prefs/apps, read server-side from https://oauth.reddit.com with an app-only token
// (env REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET; fail loud naming them when missing), pass that
// base and fetcher here, and add the host to vercel.json connect-src, csp.test.ts and legal.ts only
// if a browser ever reads it. Attribution: link to the post's permalink and name the subreddit.
//   GET <base>/r/<sub>/search.json?q=<term>&restrict_sr=1&sort=new&t=month&limit=50
//   →  { data: { children: [{ kind: 't3', data: { id, title, selftext, permalink, created_utc,
//        author, subreddit, link_flair_text } }] } }
import { httpUrl } from '../../httpUrl';
import type { Posting } from '../types';
import { arr, num, obj, str, type FetchJson } from './http';
import { isHiringPost } from './social';

export const REDDIT_SUBS = ['DesignSystems', 'UXDesign', 'forhire'];
export const REDDIT_ENV = ['REDDIT_CLIENT_ID', 'REDDIT_CLIENT_SECRET'] as const;
const WEB = 'https://www.reddit.com';

export const redditSearchUrl = (base: string, sub: string, term: string) =>
  `${base}/r/${sub}/search.json?q=${encodeURIComponent(term)}&restrict_sr=1&sort=new&t=month&limit=50`;

/** r/forhire tags every post [Hiring] or [For Hire]; elsewhere the post must read as hiring. */
export function parseRedditPost(child: unknown): Posting | null {
  const d = obj(obj(child).data);
  const id = str(d.id);
  const title = str(d.title).trim();
  const body = str(d.selftext).trim();
  const flair = str(d.link_flair_text);
  const url = httpUrl(`${WEB}${str(d.permalink)}`);
  if (!id || !title || !str(d.permalink).startsWith('/r/') || !url) return null;
  if (/\[\s*for hire\s*\]/i.test(title) || /^for hire$/i.test(flair)) return null;
  const tagged = /\[\s*hiring\s*\]/i.test(title) || /^hiring$/i.test(flair);
  if (!tagged && !isHiringPost(`${title}\n${body}`)) return null;
  const created = num(d.created_utc);
  return {
    id: `reddit:${id}`,
    source: 'reddit',
    title: title.replace(/^\s*\[\s*hiring\s*\]\s*/i, '').slice(0, 120),
    company: '',
    url,
    location: '',
    postedAt: created ? new Date(created * 1000).toISOString() : undefined,
    text: `Posted in r/${str(d.subreddit)} by u/${str(d.author)}\n${body}`,
  };
}

export async function fetchReddit(
  term: string,
  fetchJson: FetchJson,
  base: string = WEB,
): Promise<Posting[]> {
  if (!term.trim()) return [];
  const pages = await Promise.all(
    REDDIT_SUBS.map((s) => fetchJson(redditSearchUrl(base, s, term.trim()))),
  );
  return pages
    .flatMap((b) => arr(obj(obj(b).data).children).map(parseRedditPost))
    .filter((p): p is Posting => !!p);
}
