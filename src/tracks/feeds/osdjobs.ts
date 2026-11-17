// Open Source Design's job board RSS (keyless; design work on open-source projects, paid and
// volunteer). Server only: the browser never contacts it (no CSP entry); legal.ts names it as a
// service our server reads.
// UNVERIFIED LIVE: opensourcedesign.net is outside the build sandbox's network. The feed is the
// Jekyll site's (github.com/opensourcedesign/jobs), pinned in keylessMore.test.ts:
//   GET https://opensourcedesign.net/jobs/feed.xml
//   <item>: title, link, guid, pubDate, description (HTML)
// Terms: a community site whose posts are submitted openly on GitHub; each row links to its job
// page as given and is credited "Open Source Design" (SOURCE_LABEL.osdjobs).
// Rate limit: none; one request on the morning run. Only design-systems roles are kept.
import { htmlToText } from '../../feed/html.ts';
import { httpUrl } from '../../httpUrl.ts';
import type { NormalizedPosting } from '../score.ts';
import { fetchKeyed, SourceHttpError, type FeedContext } from './context.ts';
import { USER_AGENT } from './dsjobsCatalog.ts';
import { isDsRole, isRemoteRole } from './dsRole.ts';
import { isoDate } from './shape.ts';

export const OSDJOBS_URL = 'https://opensourcedesign.net/jobs/feed.xml';

const tag = (block: string, name: string): string => {
  const m = block.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`));
  return (m?.[1] ?? '').replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1').trim();
};

export function parseOsdJobs(xml: string): NormalizedPosting[] {
  const out: NormalizedPosting[] = [];
  for (const [, block] of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/g)) {
    const url = httpUrl(htmlToText(tag(block, 'link')));
    const title = htmlToText(tag(block, 'title'));
    const key = htmlToText(tag(block, 'guid')) || url;
    if (!url || !title || !key) continue;
    const text = htmlToText(htmlToText(tag(block, 'description')));
    if (!isDsRole(title, text)) continue;
    out.push({
      source: 'osdjobs',
      sourceId: `osdjobs:${key}`,
      title,
      company: '',
      remote: isRemoteRole(false, title) || undefined,
      url,
      descriptionText: text,
      postedAt: isoDate(htmlToText(tag(block, 'pubDate'))),
    });
  }
  return out;
}

export async function readOsdJobs(ctx: FeedContext): Promise<NormalizedPosting[]> {
  const r = await fetchKeyed(ctx, 'Open Source Design', OSDJOBS_URL, {
    headers: { 'user-agent': USER_AGENT },
  });
  if (!r.ok) throw new SourceHttpError('Open Source Design', r.status);
  return parseOsdJobs(await r.text());
}
