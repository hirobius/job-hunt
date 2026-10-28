// We Work Remotely — public RSS feeds per category (UNVERIFIED LIVE: written from the documented
// feed list at weworkremotely.com/remote-job-rss-feed and the feed's usual item shape; this build
// environment cannot reach weworkremotely.com).
//   GET https://weworkremotely.com/categories/remote-design-jobs.rss
//   GET https://weworkremotely.com/categories/remote-front-end-programming-jobs.rss
// Design-systems roles are filed as Design (designers) or Front-End Programming (engineers), so both
// are read and merged. Each <item> is "Company: Role", a link/guid to the WWR job page, a pubDate,
// an entity-encoded HTML description and WWR's own <region>/<type> tags.
// Terms (their feed page): the feeds are open to anyone, "all we ask is that you attribute the links
// back to We Work Remotely". Kept as hard behaviour: every row links to its WWR page as given and
// names "We Work Remotely" as its source. Read through /api/boards (no CORS), at most about hourly.
import { httpUrl } from '../../httpUrl';
import type { Posting } from '../types';
import type { ProxiedSource } from './proxiedIds';
import { parseRss } from './rss';

export const WWR_FEEDS = [
  'https://weworkremotely.com/categories/remote-design-jobs.rss',
  'https://weworkremotely.com/categories/remote-front-end-programming-jobs.rss',
];

export function parseWwr(xml: string): Posting[] {
  const out: Posting[] = [];
  for (const it of parseRss(xml)) {
    const url = httpUrl(it.link);
    const key = it.guid || it.link;
    if (!url || !key) continue;
    // "Acme Inc: Senior Product Designer" — the first colon splits (a role may have its own).
    const colon = it.title.indexOf(': ');
    const type = it.tag('type');
    out.push({
      id: `wwr:${key}`,
      source: 'wwr',
      title: colon > 0 ? it.title.slice(colon + 2).trim() : it.title,
      company: colon > 0 ? it.title.slice(0, colon).trim() : '',
      url,
      location: it.tag('region'),
      mode: 'remote',
      postedAt: it.pubDate,
      text: [type && `Job type: ${type}`, it.description].filter(Boolean).join('\n'),
    });
  }
  return out;
}

export const weWorkRemotely: ProxiedSource = {
  id: 'wwr',
  upstream: () => WWR_FEEDS,
  parse: parseWwr,
};
