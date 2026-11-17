// Jobgether public jobs API (keyless, keyword search; large remote aggregator). Server only: the
// browser never contacts it (no CSP entry); legal.ts names it as a service our server reads.
// UNVERIFIED LIVE: jobgether.com is outside the build sandbox's network. The shape is from its
// developer page and OpenAPI 3.1 file (jobgether.com/developers, /openapi.json, via search),
// pinned in keylessMore.test.ts:
//   GET https://jobgether.com/api/v1/jobs?keyword=<term>
//   → { jobs: [{ id, title, company: { name }, location, remote, posted_at, url, description }] }
// Terms (jobgether.com/developers): "No API key · No signup", made for agents answering job
// searches. Each row links to its Jobgether offer page as given and is credited "Jobgether"
// (SOURCE_LABEL.jobgether). Its links are not the employer's, so it ranks below every other source
// (roleKey.ts RANK): a company-board copy of the same role wins the dedupe.
// Rate limit: none published; JOBGETHER_PHRASES calls on the morning run, spaced.
// Only design-systems roles are kept (dsRole.ts).
import { htmlToText } from '../../feed/html.ts';
import { httpUrl } from '../../httpUrl.ts';
import type { NormalizedPosting } from '../score.ts';
import { fetchKeyed, markPartial, SourceHttpError, type FeedContext } from './context.ts';
import { USER_AGENT } from './dsjobsCatalog.ts';
import { isDsRole, isRemoteRole } from './dsRole.ts';
import { isoDate, obj, pick, rowsOf } from './shape.ts';

export const JOBGETHER_PHRASES = ['design system', 'design technologist', 'design engineer'];
export const CALL_GAP_MS = 1000;
export const jobgetherUrl = (term: string) =>
  `https://jobgether.com/api/v1/jobs?keyword=${encodeURIComponent(term)}`;

export function parseJobgether(json: unknown): NormalizedPosting[] {
  const out: NormalizedPosting[] = [];
  for (const raw of rowsOf(json, 'jobs', 'data', 'results', 'offers')) {
    const j = obj(raw);
    const id = pick(j, 'id', 'slug');
    const title = htmlToText(pick(j, 'title', 'name'));
    const url = httpUrl(pick(j, 'url', 'link', 'offer_url'));
    if (!id || !title || !url) continue;
    const text = htmlToText(pick(j, 'description', 'summary'));
    if (!isDsRole(title, text)) continue;
    const location = htmlToText(pick(j, 'location', 'location.name', 'locations'));
    out.push({
      source: 'jobgether',
      sourceId: `jobgether:${id}`,
      title,
      company: htmlToText(pick(j, 'company.name', 'company_name', 'company')),
      location: location || undefined,
      remote:
        isRemoteRole(j.remote, `${location} ${pick(j, 'remote_type', 'workplace')}`) || undefined,
      url,
      descriptionText: text,
      postedAt: isoDate(pick(j, 'posted_at', 'published_at', 'created_at', 'date')),
    });
  }
  return out;
}

export async function readJobgether(ctx: FeedContext): Promise<NormalizedPosting[]> {
  const seen = new Map<string, NormalizedPosting>();
  let failed: SourceHttpError | undefined;
  let answered = false;
  for (const [i, term] of JOBGETHER_PHRASES.entries()) {
    if (i) await ctx.sleep(CALL_GAP_MS);
    const r = await fetchKeyed(ctx, 'Jobgether', jobgetherUrl(term), {
      headers: { accept: 'application/json', 'user-agent': USER_AGENT },
    });
    if (!r.ok) {
      failed = new SourceHttpError('Jobgether', r.status);
      continue;
    }
    answered = true;
    for (const p of parseJobgether(await r.json()))
      if (!seen.has(p.sourceId)) seen.set(p.sourceId, p);
  }
  if (!answered && failed) throw failed;
  return failed ? markPartial([...seen.values()]) : [...seen.values()];
}
