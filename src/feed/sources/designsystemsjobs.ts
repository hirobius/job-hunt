// designsystems.jobs — a board of design-systems roles only, with a public RSS feed (VERIFIED LIVE
// 2026-10-28 from the build sandbox: 20 items, 13 to 27 Oct, all design-systems titles).
//   GET https://designsystems.jobs/feed  →  RSS 2.0, the newest ~20 openings
// Each <item> is "Role at Company", a link and guid to the posting's page on designsystems.jobs, a
// pubDate and a description "Category · Seniority · Full time · Remote · Country".
// No CORS header, so the browser reads it through /api/boards (proxied.ts), which polls it at most
// about hourly. The feed states no terms of its own; we keep to the polite reading: every row links
// to its designsystems.jobs page as given and names "designsystems.jobs" as its source.
// The sync edge function reads the same feed on its morning run (tracks/sources.ts).
import { httpUrl } from '../../httpUrl';
import type { JobMode } from '../../types';
import type { Posting } from '../types';
import type { ProxiedSource } from './proxiedIds';
import { parseRss } from './rss';

export const DSJOBS_FEED = 'https://designsystems.jobs/feed';

const MODES: Record<string, JobMode> = { remote: 'remote', hybrid: 'hybrid', onsite: 'onsite' };
const fold = (s: string) => s.toLowerCase().replace(/[\s-]/g, '');
/** Parts of the line that are never a place. */
const NOT_PLACE =
  /^(remote|hybrid|onsite|fulltime|parttime|contract|freelance|internship|temporary)$/;

export function parseDsJobs(xml: string): Posting[] {
  const out: Posting[] = [];
  for (const it of parseRss(xml)) {
    const url = httpUrl(it.link);
    const key = it.guid || it.link;
    if (!url || !key) continue;
    const at = it.title.lastIndexOf(' at ');
    const parts = it.description
      .split('·')
      .map((s) => s.trim())
      .filter(Boolean);
    const mode = parts.map((s) => MODES[fold(s)]).find(Boolean);
    const last = parts.length > 1 ? parts[parts.length - 1] : '';
    const p: Posting = {
      id: `dsjobs:${key}`,
      source: 'dsjobs',
      title: at > 0 ? it.title.slice(0, at).trim() : it.title,
      company: at > 0 ? it.title.slice(at + 4).trim() : '',
      url,
      // The last part is the place ("United States, Canada"), unless it is a mode or a job type.
      location: last && !NOT_PLACE.test(fold(last)) ? last : '',
      postedAt: it.pubDate,
      text: it.description,
    };
    if (mode) p.mode = mode;
    out.push(p);
  }
  return out;
}

export const dsJobs: ProxiedSource = {
  id: 'dsjobs',
  upstream: () => [DSJOBS_FEED],
  parse: parseDsJobs,
};
