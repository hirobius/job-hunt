// The sync edge function's own source (Muse Phase 2.5): the designsystems.jobs RSS feed, which only
// the server reads (the browser would need a CSP and legal.ts entry). Boards and the term feeds
// are read with the app's parsers (src/feed/sources, through sync.ts). `onFail` hears a status
// that is not ok. Pure apart from the injected fetch; never imported by the app bundle.
import type { BoardKind } from '../feed/sources/ats.ts';
import { httpUrl } from '../httpUrl.ts';
import { fingerprint, type NormalizedPosting } from './score.ts';

/** A board one user follows: its kind and slug, and the name they gave the company. */
export interface WatchedCompany {
  company: string;
  ats: BoardKind;
  slug: string;
  /** Lever's EU host. */
  eu?: true;
}

type Fetch = (url: string) => Promise<Response>;
type OnFail = (status: number) => void;

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export const DESIGN_SYSTEMS_JOBS_FEED = 'https://designsystems.jobs/feed';

const tagOf = (block: string, name: string): string => {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return (m?.[1] ?? '').replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1').trim();
};

/** designsystems.jobs (Phase 2.5): each <item> is "Role at Company", a link, a guid, a
 *  description "Category · Seniority · Full time · Remote · Country" and a pubDate. */
export async function fetchDesignSystemsJobsFeed(
  f: Fetch = fetch,
  onFail?: OnFail,
): Promise<NormalizedPosting[]> {
  const r = await f(DESIGN_SYSTEMS_JOBS_FEED);
  if (!r.ok) {
    onFail?.(r.status);
    return [];
  }
  const xml = await r.text();
  const items = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/g)].map((m) => {
    const block = m[1];
    const full = stripHtml(tagOf(block, 'title'));
    const at = full.lastIndexOf(' at ');
    const description = stripHtml(tagOf(block, 'description'));
    const parts = description
      .split('·')
      .map((s) => s.trim())
      .filter(Boolean);
    const link = tagOf(block, 'link');
    const pub = tagOf(block, 'pubDate');
    const posted = pub ? new Date(pub) : null;
    return {
      source: 'rss' as const,
      sourceId: tagOf(block, 'guid') || link,
      title: at > 0 ? full.slice(0, at).trim() : full,
      company: at > 0 ? full.slice(at + 4).trim() : '',
      location: parts.length ? parts[parts.length - 1] : undefined,
      remote: /\bremote\b/i.test(description),
      url: link,
      descriptionText: description,
      postedAt: posted && !Number.isNaN(posted.getTime()) ? posted.toISOString() : undefined,
    };
  });
  // An item with no guid and no link still needs a key of its own (one upsert can't hold the same
  // key twice): its fingerprint.
  for (const p of items) if (!p.sourceId) p.sourceId = `fp:${fingerprint(p)}`;
  return items;
}

/** Postings whose link is a web page (an http(s) URL): anything else never becomes an href. */
export const webOnly = (postings: NormalizedPosting[]) => postings.filter((p) => httpUrl(p.url));
