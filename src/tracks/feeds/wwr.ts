// We Work Remotely's public RSS feeds, read by the sync (keyless). Server only: the browser's own
// /api/boards route for it stays off (SOURCE_ENABLED.wwr); the browser never contacts it here.
// UNVERIFIED LIVE: weworkremotely.com is outside the build sandbox's network; the item shape is the
// browser adapter's (feed/sources/weworkremotely.ts), pinned in keyless.test.ts.
//   GET https://weworkremotely.com/categories/remote-design-jobs.rss
//   GET https://weworkremotely.com/categories/remote-front-end-programming-jobs.rss
//   <item>: title "Company: Role", link, guid, pubDate, description (HTML), region, type
// Terms (weworkremotely.com/remote-job-rss-feed): the feeds are open to anyone; "all we ask is that
// you attribute the links back to We Work Remotely". Kept as hard behaviour: every row links to its
// WWR job page as given and is credited "We Work Remotely" (SOURCE_LABEL.wwr).
// Rate limit: none published; two requests on the morning run. Every row is remote; only
// design-systems roles are kept (dsRole.ts).
import { htmlToText } from '../../feed/html.ts';
import { httpUrl } from '../../httpUrl.ts';
import type { NormalizedPosting } from '../score.ts';
import { fetchKeyed, markPartial, SourceHttpError, type FeedContext } from './context.ts';
import { USER_AGENT } from './dsjobsCatalog.ts';
import { isDsRole } from './dsRole.ts';

export const WWR_FEEDS = [
  'https://weworkremotely.com/categories/remote-design-jobs.rss',
  'https://weworkremotely.com/categories/remote-front-end-programming-jobs.rss',
] as const;

const tag = (block: string, name: string): string => {
  const m = block.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`));
  return (m?.[1] ?? '').replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1').trim();
};

export function parseWwr(xml: string): NormalizedPosting[] {
  const out: NormalizedPosting[] = [];
  for (const [, block] of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/g)) {
    const url = httpUrl(htmlToText(tag(block, 'link')));
    const key = htmlToText(tag(block, 'guid')) || url;
    const full = htmlToText(tag(block, 'title'));
    if (!url || !key || !full) continue;
    // "Acme Inc: Senior Product Designer": the first colon splits (a role may have its own).
    const colon = full.indexOf(': ');
    const title = colon > 0 ? full.slice(colon + 2).trim() : full;
    const type = htmlToText(tag(block, 'type'));
    // The description is HTML, entity-encoded (or in CDATA): decode, then strip.
    const body = htmlToText(htmlToText(tag(block, 'description')));
    const text = [type && `Job type: ${type}`, body].filter(Boolean).join('\n');
    if (!isDsRole(title, body)) continue;
    const posted = Date.parse(htmlToText(tag(block, 'pubDate')));
    out.push({
      source: 'wwr',
      sourceId: `wwr:${key}`,
      title,
      company: colon > 0 ? full.slice(0, colon).trim() : '',
      location: htmlToText(tag(block, 'region')) || undefined,
      remote: true,
      url,
      descriptionText: text,
      postedAt: Number.isNaN(posted) ? undefined : new Date(posted).toISOString(),
    });
  }
  return out;
}

/** Both feeds, merged once per job. One failing keeps the other's; both failing fails the read. */
export async function readWwr(ctx: FeedContext): Promise<NormalizedPosting[]> {
  const seen = new Map<string, NormalizedPosting>();
  let failed: SourceHttpError | undefined;
  let answered = false;
  for (const url of WWR_FEEDS) {
    const r = await fetchKeyed(ctx, 'We Work Remotely', url, {
      headers: { 'user-agent': USER_AGENT },
    });
    if (!r.ok) {
      failed = new SourceHttpError('We Work Remotely', r.status);
      continue;
    }
    answered = true;
    for (const p of parseWwr(await r.text())) if (!seen.has(p.sourceId)) seen.set(p.sourceId, p);
  }
  if (!answered && failed) throw failed;
  // One feed failing: not the whole list, so nothing closes as missed against it.
  return failed ? markPartial([...seen.values()]) : [...seen.values()];
}
