// Working Nomads — remote jobs, with a public keyless JSON list of the jobs currently on the site
// (UNVERIFIED LIVE: written from the shape third-party readers describe; this build environment
// cannot reach workingnomads.com, and no official API page or terms for it were found).
//   GET https://www.workingnomads.com/api/exposed_jobs/
//   →  [ { url, title, description (HTML), company_name, category_name, tags, location, pub_date } ]
// No search: the whole list is read once (hourly, through /api/boards: no CORS) and matched here.
// Every row links to the job's own Working Nomads `url` and names "Working Nomads" as its source.
// OFF by default (SOURCE_ENABLED.workingnomads) until its terms are read from a network that
// reaches it.
import { htmlToText } from '../html';
import { httpUrl } from '../../httpUrl';
import type { Posting } from '../types';
import { arr, obj, str } from './http';
import type { ProxiedSource } from './proxied';
import { rssDate } from './rss';

export const WORKING_NOMADS_URL = 'https://www.workingnomads.com/api/exposed_jobs/';

export function parseWorkingNomadsJob(j: unknown): Posting | null {
  const o = obj(j);
  const url = httpUrl(str(o.url));
  if (!url) return null;
  const tags = (Array.isArray(o.tags) ? arr(o.tags).map(str) : str(o.tags).split(','))
    .map((t) => t.trim())
    .filter(Boolean);
  const category = str(o.category_name);
  return {
    id: `workingnomads:${url}`,
    source: 'workingnomads',
    title: str(o.title),
    company: str(o.company_name),
    url,
    location: str(o.location),
    mode: 'remote',
    postedAt: rssDate(str(o.pub_date)),
    text: [
      category && `Category: ${category}`,
      tags.length > 0 && `Tags: ${tags.join(', ')}`,
      htmlToText(str(o.description)),
    ]
      .filter(Boolean)
      .join('\n'),
  };
}

export function parseWorkingNomads(body: string): Posting[] {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return [];
  }
  return arr(json)
    .map(parseWorkingNomadsJob)
    .filter((p): p is Posting => !!p);
}

export const workingNomads: ProxiedSource = {
  id: 'workingnomads',
  upstream: () => [WORKING_NOMADS_URL],
  parse: parseWorkingNomads,
};
