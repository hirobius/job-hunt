// TheirStack job search (docs/research/ds-job-sources.md, source 4). Server only; OFF until a key
// is set (SOURCE_ENABLED.theirstack). UNVERIFIED LIVE: the host answered from the build sandbox
// (405 to a GET), but no key was available, so the request and answer shapes below are from its
// public API docs (api.theirstack.com, "Search jobs"), pinned in theirstack.test.ts.
//   POST https://api.theirstack.com/v1/jobs/search   Authorization: Bearer <THEIRSTACK_API_KEY>
//   { job_title_or, posted_at_max_age_days, remote, limit, page, order_by }
//   → { metadata, data: [{ id, job_title, url, final_url, date_posted, company, company_object,
//        location, short_location, remote, hybrid, description, … }] }
// Terms: a commercial API; the free tier is 200 credits a month, 1 credit per job returned
// (theirstack.com/en/pricing). The key is a Supabase function secret, never in the app bundle, so
// the browser never contacts TheirStack (no CSP or connect-src entry); legal.ts names it as a
// service our server reads. Attribution: none required; each row links to the posting's own page
// (the ATS link when TheirStack has it) and is credited "TheirStack" (SOURCE_LABEL.theirstack).
// Rate limit / budget: one call of LIMIT rows on each due day (`theirstackDue`): 10 days a month
// × 18 rows = 180 credits, under the 200 free (the morning run is once a day; a manual
// `{"rss": true}` call on a due day spends another 18). Only remote roles are asked for, so no
// credit goes on a role the Feed would drop.
import { htmlToText } from '../../feed/html.ts';
import { httpUrl } from '../../httpUrl.ts';
import type { NormalizedPosting } from '../score.ts';
import { needKeys, SourceHttpError, type FeedContext } from './context.ts';

export const THEIRSTACK_URL = 'https://api.theirstack.com/v1/jobs/search';
export const THEIRSTACK_ENV = ['THEIRSTACK_API_KEY'] as const;
/** Substring title filters (TheirStack matches them case-insensitively). */
export const THEIRSTACK_TITLES = ['design system', 'design technologist'];
export const THEIRSTACK_LIMIT = 18;
/** The window each call asks for: the longest gap between due days (the 28th to the 1st is up to
 *  4 days), so no posting falls between two calls. */
export const THEIRSTACK_MAX_AGE_DAYS = 4;

/** Due on the 1st, 4th, … 28th (UTC): 10 calls a month, never two within 3 days. */
export const theirstackDue = (d: Date) => d.getUTCDate() <= 28 && (d.getUTCDate() - 1) % 3 === 0;

export const theirstackBody = () => ({
  page: 0,
  limit: THEIRSTACK_LIMIT,
  job_title_or: THEIRSTACK_TITLES,
  posted_at_max_age_days: THEIRSTACK_MAX_AGE_DAYS,
  remote: true,
  order_by: [{ field: 'date_posted', desc: true }],
  include_total_results: false,
});

type O = Record<string, unknown>;
const obj = (v: unknown): O =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as O) : {};
const str = (v: unknown) =>
  typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';

export function parseTheirStack(json: unknown): NormalizedPosting[] {
  const rows = obj(json).data;
  if (!Array.isArray(rows)) return [];
  const out: NormalizedPosting[] = [];
  for (const raw of rows) {
    const j = obj(raw);
    const id = str(j.id);
    const title = htmlToText(str(j.job_title));
    // The ATS link first: it is the original, and the dedupe ranks the ATS row above this one.
    const url = httpUrl(str(j.final_url)) ?? httpUrl(str(j.url));
    if (!id || !title || !url) continue;
    const posted = Date.parse(str(j.date_posted));
    out.push({
      source: 'theirstack',
      sourceId: `theirstack:${id}`,
      title,
      company: htmlToText(str(obj(j.company_object).name) || str(j.company)),
      location: str(j.short_location) || str(j.location) || undefined,
      remote: j.remote === true || undefined,
      url,
      descriptionText: htmlToText(str(j.description)),
      postedAt: Number.isNaN(posted) ? undefined : new Date(posted).toISOString(),
    });
  }
  return out;
}

/** One search, or [] when today is not a due day. Throws MissingKeyError without the key. */
export async function readTheirStack(ctx: FeedContext): Promise<NormalizedPosting[]> {
  const { THEIRSTACK_API_KEY: key } = needKeys(ctx, THEIRSTACK_ENV);
  if (!theirstackDue(ctx.now())) return [];
  const r = await ctx.fetch(THEIRSTACK_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify(theirstackBody()),
  });
  if (!r.ok) throw new SourceHttpError('TheirStack', r.status);
  return parseTheirStack(await r.json());
}
