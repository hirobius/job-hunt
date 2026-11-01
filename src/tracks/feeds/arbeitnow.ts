// Arbeitnow job board API (keyless; Europe-heavy, many roles read from company ATSs). Server only:
// the browser never contacts it (no CSP entry); legal.ts names it as a service our server reads.
// UNVERIFIED LIVE: arbeitnow.com is outside the build sandbox's network, so the shape is from its
// documentation (arbeitnow.com/blog/job-board-api), pinned in keyless.test.ts.
//   GET https://www.arbeitnow.com/api/job-board-api?page=<n>
//   → { data: [{ slug, company_name, title, description (HTML), remote, url, tags, job_types,
//        location, created_at (unix seconds) }], links: { next }, meta }
// Terms (arbeitnow.com/terms, API section, read 2026-10-29 via search): free, no key, "as is",
// may be revoked at any time, and users "must provide a link back to Arbeitnow.com" on the platform
// showing the data. Kept as hard behaviour: every row links to its Arbeitnow job page (`url`, as
// given) and is credited "Arbeitnow" (SOURCE_LABEL.arbeitnow).
// Rate limit: none published. We read ARBEITNOW_PAGES pages once a day, PAGE_GAP_MS apart.
// Only remote design-systems roles are kept (dsRole.ts).
import { htmlToText } from '../../feed/html.ts';
import { httpUrl } from '../../httpUrl.ts';
import type { NormalizedPosting } from '../score.ts';
import { fetchKeyed, SourceHttpError, type FeedContext } from './context.ts';
import { isDsRole } from './dsRole.ts';

export const ARBEITNOW_PAGES = 5;
export const PAGE_GAP_MS = 1000;
export const arbeitnowUrl = (page: number) =>
  `https://www.arbeitnow.com/api/job-board-api?page=${page}`;

type O = Record<string, unknown>;
const obj = (v: unknown): O =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as O) : {};
const str = (v: unknown) =>
  typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';

export function parseArbeitnow(json: unknown): NormalizedPosting[] {
  const rows = obj(json).data;
  if (!Array.isArray(rows)) return [];
  const out: NormalizedPosting[] = [];
  for (const raw of rows) {
    const j = obj(raw);
    const slug = str(j.slug);
    const title = htmlToText(str(j.title));
    const url = httpUrl(str(j.url));
    if (!slug || !title || !url || j.remote !== true) continue;
    const text = htmlToText(str(j.description));
    if (!isDsRole(title, text)) continue;
    const seconds = typeof j.created_at === 'number' ? j.created_at : NaN;
    out.push({
      source: 'arbeitnow',
      sourceId: `arbeitnow:${slug}`,
      title,
      company: htmlToText(str(j.company_name)),
      location: str(j.location) || undefined,
      remote: true,
      url,
      descriptionText: text,
      postedAt: Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : undefined,
    });
  }
  return out;
}

/** The newest pages, newest first, until the list ends. A failed first page fails the read; a
 *  later one keeps what came before. */
export async function readArbeitnow(ctx: FeedContext): Promise<NormalizedPosting[]> {
  const seen = new Map<string, NormalizedPosting>();
  for (let page = 1; page <= ARBEITNOW_PAGES; page++) {
    if (page > 1) await ctx.sleep(PAGE_GAP_MS);
    const r = await fetchKeyed(ctx, 'Arbeitnow', arbeitnowUrl(page));
    if (!r.ok) {
      if (page === 1) throw new SourceHttpError('Arbeitnow', r.status);
      break;
    }
    const json = await r.json();
    for (const p of parseArbeitnow(json)) if (!seen.has(p.sourceId)) seen.set(p.sourceId, p);
    const rows = obj(json).data;
    if (!Array.isArray(rows) || rows.length === 0 || !str(obj(obj(json).links).next)) break;
  }
  return [...seen.values()];
}
