// A small RSS 2.0 reader for the job-board feeds (designsystems.jobs, We Work Remotely, Authentic
// Jobs). No DOM: it runs in the /api/boards edge function and in tests alike, and only ever reads
// the handful of tags a job item carries. Every value comes back as plain text (CDATA unwrapped,
// entities decoded, tags stripped), so nothing from a feed is ever rendered as HTML.
import { decodeEntities, htmlToText } from '../html';

export interface RssItem {
  title: string;
  link: string;
  guid: string;
  /** ISO, or undefined when missing or unreadable. */
  pubDate?: string;
  /** Plain text. */
  description: string;
  /** Read any other tag of the item as plain text ('' when absent), e.g. `region`,
   *  `job_listing:company`. */
  tag: (name: string) => string;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The raw inner text of the first `<name>` in `block` (exact tag name, so `link` never matches
 *  `<linkedin>`), CDATA unwrapped; '' when absent or self-closing. */
export function rawTag(block: string, name: string): string {
  const n = escapeRe(name);
  const m = new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)</${n}>`, 'i').exec(block);
  if (!m) return '';
  const inner = m[1].trim();
  const cdata = /^<!\[CDATA\[([\s\S]*?)\]\]>$/.exec(inner);
  // A CDATA body is raw HTML; anything else is entity-encoded HTML (or plain text).
  return cdata ? cdata[1] : decodeEntities(inner);
}

/** The tag as plain text: HTML stripped, entities decoded, whitespace folded. */
export const textTag = (block: string, name: string) => htmlToText(rawTag(block, name));

/** An RSS date (RFC 822) or ISO string → ISO; undefined when it can't be read. */
export function rssDate(s: string): string | undefined {
  if (!s) return undefined;
  const t = Date.parse(s);
  return Number.isNaN(t) ? undefined : new Date(t).toISOString();
}

export function parseRss(xml: string): RssItem[] {
  return [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map(([, block]) => ({
    title: textTag(block, 'title').replace(/\s+/g, ' '),
    link: rawTag(block, 'link').trim(),
    guid: rawTag(block, 'guid').trim(),
    pubDate: rssDate(rawTag(block, 'pubDate').trim()),
    description: textTag(block, 'description'),
    tag: (name: string) => textTag(block, name),
  }));
}
