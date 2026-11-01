// Authentic Jobs — a long-running board for designers and developers (UNVERIFIED LIVE: the feed
// URL and item shape are those of the WP Job Manager plugin the site is built on, not read from the
// site; this build environment cannot reach authenticjobs.com, and no current feed documentation
// was found).
//   GET https://authenticjobs.com/feed/?post_type=job_listing  →  RSS 2.0
// Each <item> is the role as its title, a link/guid to the Authentic Jobs page, a pubDate, an HTML
// description and <job_listing:company> / <job_listing:location> / <job_listing:job_type>.
// Read through /api/boards (no CORS), at most about hourly. Every row links to its Authentic Jobs
// page and names "Authentic Jobs" as its source. OFF by default (SOURCE_ENABLED.authenticjobs)
// until the feed and its terms are checked from a network that reaches the site.
import { httpUrl } from '../../httpUrl';
import type { Posting } from '../types';
import type { ProxiedSource } from './proxiedIds';
import { parseRss } from './rss';

export const AUTHENTIC_JOBS_FEED = 'https://authenticjobs.com/feed/?post_type=job_listing';

export function parseAuthenticJobs(xml: string): Posting[] {
  const out: Posting[] = [];
  for (const it of parseRss(xml)) {
    const url = httpUrl(it.link);
    const key = it.guid || it.link;
    if (!url || !key) continue;
    const location = it.tag('job_listing:location');
    const type = it.tag('job_listing:job_type');
    out.push({
      id: `authenticjobs:${key}`,
      source: 'authenticjobs',
      title: it.title,
      company: it.tag('job_listing:company'),
      url,
      location,
      ...(/\bremote\b/i.test(`${location} ${type}`) ? { mode: 'remote' as const } : {}),
      postedAt: it.pubDate,
      text: [type && `Job type: ${type}`, it.description].filter(Boolean).join('\n'),
    });
  }
  return out;
}

export const authenticJobs: ProxiedSource = {
  id: 'authenticjobs',
  upstream: () => [AUTHENTIC_JOBS_FEED],
  parse: parseAuthenticJobs,
};
