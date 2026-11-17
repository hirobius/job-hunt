// Get on Board public API (keyless; Latin American tech, remote-heavy). Server only: the browser
// never contacts it (no CSP entry); legal.ts names it as a service our server reads.
// UNVERIFIED LIVE: getonbrd.com is outside the build sandbox's network. The shape is from its API
// docs (api-doc.getonbrd.com, via search), pinned in keylessMore.test.ts:
//   GET https://www.getonbrd.com/api/v0/search/jobs?query=<term>&per_page=100&page=1&expand=["company"]
//   → { data: [{ id, type: "job", attributes: { title, description, remote, remote_modality,
//        countries, published_at (unix s), company: { data: { attributes: { name } } } },
//        links: { public_url } }], meta }
// Terms (getonbrd.com/help, "What can I do with Get on Board's API?"): the public API needs no
// setup or authentication and covers published jobs and companies. Each row links to its
// `public_url` as given and is credited "Get on Board" (SOURCE_LABEL.getonbrd).
// Rate limit: none published; GETONBRD_PHRASES calls on the morning run, spaced.
// Only design-systems roles are kept (dsRole.ts).
import { htmlToText } from '../../feed/html.ts';
import { httpUrl } from '../../httpUrl.ts';
import type { NormalizedPosting } from '../score.ts';
import { fetchKeyed, markPartial, SourceHttpError, type FeedContext } from './context.ts';
import { USER_AGENT } from './dsjobsCatalog.ts';
import { isDsRole, isRemoteRole } from './dsRole.ts';
import { isoDate, obj, pick, rowsOf } from './shape.ts';

export const GETONBRD_PHRASES = ['design system', 'design engineer'];
export const CALL_GAP_MS = 1000;
export const getOnBrdUrl = (term: string) =>
  `https://www.getonbrd.com/api/v0/search/jobs?query=${encodeURIComponent(term)}&per_page=100&page=1&expand=${encodeURIComponent('["company"]')}`;

export function parseGetOnBrd(json: unknown): NormalizedPosting[] {
  const out: NormalizedPosting[] = [];
  for (const raw of rowsOf(json, 'data')) {
    const j = obj(raw);
    const a = obj(j.attributes);
    const id = pick(j, 'id');
    const title = htmlToText(pick(a, 'title'));
    const url = httpUrl(pick(j, 'links.public_url') || pick(a, 'public_url'));
    if (!id || !title || !url) continue;
    const text = htmlToText(
      [pick(a, 'description'), pick(a, 'functions'), pick(a, 'projects')]
        .filter(Boolean)
        .join('\n'),
    );
    if (!isDsRole(title, text)) continue;
    const countries = Array.isArray(a.countries) ? a.countries.map(String).join(', ') : '';
    const modality = pick(a, 'remote_modality');
    const fullyRemote =
      a.remote === true && (!modality || /fully|remote_local|anywhere/.test(modality));
    out.push({
      source: 'getonbrd',
      sourceId: `getonbrd:${id}`,
      title,
      company: htmlToText(pick(a, 'company.data.attributes.name', 'company_name')),
      location: countries || undefined,
      remote: isRemoteRole(fullyRemote, countries) || (modality === 'hybrid' ? false : undefined),
      url,
      descriptionText: text,
      postedAt: isoDate(pick(a, 'published_at')),
    });
  }
  return out;
}

export async function readGetOnBrd(ctx: FeedContext): Promise<NormalizedPosting[]> {
  const seen = new Map<string, NormalizedPosting>();
  let failed: SourceHttpError | undefined;
  let answered = false;
  for (const [i, term] of GETONBRD_PHRASES.entries()) {
    if (i) await ctx.sleep(CALL_GAP_MS);
    const r = await fetchKeyed(ctx, 'Get on Board', getOnBrdUrl(term), {
      headers: { accept: 'application/json', 'user-agent': USER_AGENT },
    });
    if (!r.ok) {
      failed = new SourceHttpError('Get on Board', r.status);
      continue;
    }
    answered = true;
    for (const p of parseGetOnBrd(await r.json()))
      if (!seen.has(p.sourceId)) seen.set(p.sourceId, p);
  }
  if (!answered && failed) throw failed;
  return failed ? markPartial([...seen.values()]) : [...seen.values()];
}
