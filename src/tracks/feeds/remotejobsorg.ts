// RemoteJobs.org public jobs API (keyless, keyword search). Server only: the browser never
// contacts it (no CSP entry); legal.ts names it as a service our server reads.
// UNVERIFIED LIVE: remotejobs.org is outside the build sandbox's network. The shape is from its
// developer page (remotejobs.org/developers/api, via search), pinned in remotejobsorg.test.ts:
//   GET https://remotejobs.org/api/v1/jobs?search=<term>&limit=50&offset=0
//   → { jobs: [{ id, title, company, location, url, apply_url, description (HTML), posted_at }] }
// Terms (remotejobs.org/developers/api): free, no sign-up; "include a visible link back to
// RemoteJobs.org and keep the job's application link intact". Kept as hard behaviour: every row
// links to the job's own RemoteJobs.org `url` as given (never rewritten), and is credited
// "RemoteJobs.org" (SOURCE_LABEL.remotejobsorg). The description's appended apply link is kept as
// text. Rate limit: none published; REMOTEJOBSORG_PHRASES calls on the morning run, spaced.
// Every row is remote; only design-systems roles are kept (dsRole.ts).
import { htmlToText } from '../../feed/html.ts';
import { httpUrl } from '../../httpUrl.ts';
import type { NormalizedPosting } from '../score.ts';
import { fetchKeyed, markPartial, SourceHttpError, type FeedContext } from './context.ts';
import { USER_AGENT } from './dsjobsCatalog.ts';
import { isDsRole } from './dsRole.ts';
import { isoDate, obj, pick, rowsOf } from './shape.ts';

export const REMOTEJOBSORG_PHRASES = ['design system', 'design technologist', 'design engineer'];
export const CALL_GAP_MS = 1000;
export const remoteJobsOrgUrl = (term: string) =>
  `https://remotejobs.org/api/v1/jobs?search=${encodeURIComponent(term)}&limit=50&offset=0`;

export function parseRemoteJobsOrg(json: unknown): NormalizedPosting[] {
  const out: NormalizedPosting[] = [];
  for (const raw of rowsOf(json, 'jobs', 'data', 'results')) {
    const j = obj(raw);
    const id = pick(j, 'id', 'slug');
    const title = htmlToText(pick(j, 'title', 'position'));
    const url = httpUrl(pick(j, 'url', 'job_url', 'apply_url'));
    if (!id || !title || !url) continue;
    const text = htmlToText(pick(j, 'description', 'description_html'));
    if (!isDsRole(title, text)) continue;
    out.push({
      source: 'remotejobsorg',
      sourceId: `remotejobsorg:${id}`,
      title,
      company: htmlToText(pick(j, 'company.name', 'company_name', 'company')),
      location: htmlToText(pick(j, 'location', 'region')) || undefined,
      remote: true,
      url,
      descriptionText: text,
      postedAt: isoDate(pick(j, 'posted_at', 'published_at', 'created_at', 'date')),
    });
  }
  return out;
}

export async function readRemoteJobsOrg(ctx: FeedContext): Promise<NormalizedPosting[]> {
  const seen = new Map<string, NormalizedPosting>();
  let failed: SourceHttpError | undefined;
  let answered = false;
  for (const [i, term] of REMOTEJOBSORG_PHRASES.entries()) {
    if (i) await ctx.sleep(CALL_GAP_MS);
    const r = await fetchKeyed(ctx, 'RemoteJobs.org', remoteJobsOrgUrl(term), {
      headers: { accept: 'application/json', 'user-agent': USER_AGENT },
    });
    if (!r.ok) {
      failed = new SourceHttpError('RemoteJobs.org', r.status);
      continue;
    }
    answered = true;
    for (const p of parseRemoteJobsOrg(await r.json()))
      if (!seen.has(p.sourceId)) seen.set(p.sourceId, p);
  }
  if (!answered && failed) throw failed;
  return failed ? markPartial([...seen.values()]) : [...seen.values()];
}
