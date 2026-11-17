// 4dayweek.io public jobs API (keyless). Server only: the browser never contacts it (no CSP
// entry); legal.ts names it as a service our server reads.
// UNVERIFIED LIVE: 4dayweek.io is outside the build sandbox's network. The shape is from its
// developer page and OpenAPI file (4dayweek.io/developers, /openapi.yaml, via search), pinned in
// fourdayweek.test.ts:
//   GET https://4dayweek.io/api/v2/jobs?page=<n>&limit=100
//   → { data: [{ slug, title, company: { name, url }, location, remote, posted_at, url,
//        description }], page, limit, total, has_more }
// Terms (4dayweek.io/developers): free, public, no auth; "credit 4dayweek.io if you use this API
// in a public product". Kept as hard behaviour: every row links to its 4dayweek.io job page as
// given and is credited "4dayweek.io" (SOURCE_LABEL.fourdayweek).
// Rate limit: answers are cached 60 s (Cache-Control); we read FOURDAYWEEK_PAGES pages on the
// morning run, PAGE_GAP_MS apart. Only design-systems roles are kept (dsRole.ts).
import { htmlToText } from '../../feed/html.ts';
import { httpUrl } from '../../httpUrl.ts';
import type { NormalizedPosting } from '../score.ts';
import { fetchKeyed, markPartial, SourceHttpError, type FeedContext } from './context.ts';
import { USER_AGENT } from './dsjobsCatalog.ts';
import { isDsRole, isRemoteRole } from './dsRole.ts';
import { isoDate, obj, pick, rowsOf } from './shape.ts';

export const FOURDAYWEEK_PAGES = 5;
export const PAGE_GAP_MS = 1000;
export const fourDayWeekUrl = (page: number) =>
  `https://4dayweek.io/api/v2/jobs?page=${page}&limit=100`;

export function parseFourDayWeek(json: unknown): NormalizedPosting[] {
  const out: NormalizedPosting[] = [];
  for (const raw of rowsOf(json, 'data', 'jobs')) {
    const j = obj(raw);
    const id = pick(j, 'slug', 'id');
    const title = htmlToText(pick(j, 'title', 'role'));
    const url = httpUrl(pick(j, 'url', 'job_url', 'link'));
    if (!id || !title || !url) continue;
    const text = htmlToText(pick(j, 'description', 'description_html', 'summary'));
    if (!isDsRole(title, text)) continue;
    const location = htmlToText(pick(j, 'location', 'location_name'));
    out.push({
      source: 'fourdayweek',
      sourceId: `fourdayweek:${id}`,
      title,
      company: htmlToText(pick(j, 'company.name', 'company_name', 'company')),
      location: location || undefined,
      remote:
        isRemoteRole(j.remote, `${location} ${pick(j, 'remote_type', 'work_type')}`) || undefined,
      url,
      descriptionText: text,
      postedAt: isoDate(pick(j, 'posted_at', 'published_at', 'created_at')),
    });
  }
  return out;
}

/** Up to FOURDAYWEEK_PAGES pages, stopping when `has_more` is false. A later page failing keeps
 *  what came (marked partial); the first failing fails the read. */
export async function readFourDayWeek(ctx: FeedContext): Promise<NormalizedPosting[]> {
  const seen = new Map<string, NormalizedPosting>();
  for (let page = 1; page <= FOURDAYWEEK_PAGES; page++) {
    if (page > 1) await ctx.sleep(PAGE_GAP_MS);
    const r = await fetchKeyed(ctx, '4dayweek.io', fourDayWeekUrl(page), {
      headers: { accept: 'application/json', 'user-agent': USER_AGENT },
    });
    if (!r.ok) {
      if (page === 1) throw new SourceHttpError('4dayweek.io', r.status);
      return markPartial([...seen.values()]);
    }
    const json = await r.json();
    for (const p of parseFourDayWeek(json)) if (!seen.has(p.sourceId)) seen.set(p.sourceId, p);
    if (obj(json).has_more === false) break;
  }
  return [...seen.values()];
}
