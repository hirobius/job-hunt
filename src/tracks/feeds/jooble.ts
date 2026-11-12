// Jooble job search (docs/research/ds-job-sources.md, aggregators: "~50–150 DS jobs"). Server
// only; OFF until a key is set (SOURCE_ENABLED.jooble). UNVERIFIED LIVE: jooble.org did not answer
// from the build sandbox and no key was available, so the shapes are from its REST API page
// (jooble.org/api/about), pinned in jooble.test.ts.
//   POST https://jooble.org/api/<JOOBLE_API_KEY>   { keywords, location, page, ResultOnPage }
//   → { totalCount, jobs: [{ id, title, location, snippet, salary, source, type, link, company,
//        updated }] }
// Terms: the key is free on request for publishers; no terms page was found, so we keep to the
// polite reading: each row links through Jooble's `link` as given and is credited "Jooble"
// (SOURCE_LABEL.jooble). The key rides in the URL, so the URL is never logged or put in an error
// (SourceHttpError names the status only). The browser never contacts Jooble (no CSP entry);
// legal.ts names it as a service our server reads.
// Rate limit: none published; we make PHRASES.length calls on the morning run, CALL_GAP_MS apart.
import { htmlToText } from '../../feed/html.ts';
import { isRemoteRole } from './dsRole.ts';
import { httpUrl } from '../../httpUrl.ts';
import type { NormalizedPosting } from '../score.ts';
import { fetchKeyed, needKeys, SourceHttpError, type FeedContext } from './context.ts';

export const JOOBLE_ENV = ['JOOBLE_API_KEY'] as const;
export const JOOBLE_PHRASES = ['"design system"', '"design systems"'] as const;
export const CALL_GAP_MS = 1000;

export const joobleUrl = (key: string) => `https://jooble.org/api/${encodeURIComponent(key)}`;
export const joobleBody = (keywords: string) => ({
  keywords,
  location: 'Remote',
  page: '1',
  ResultOnPage: '50',
});

type O = Record<string, unknown>;
const obj = (v: unknown): O =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as O) : {};
const str = (v: unknown) =>
  typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';

export function parseJooble(json: unknown): NormalizedPosting[] {
  const rows = obj(json).jobs;
  if (!Array.isArray(rows)) return [];
  const out: NormalizedPosting[] = [];
  for (const raw of rows) {
    const j = obj(raw);
    const title = htmlToText(str(j.title));
    const url = httpUrl(str(j.link));
    // Jooble ids are 64-bit numbers that JSON.parse rounds, so two jobs could share one: the id in
    // the link (`/desc/<id>`) is exact; a rounded number is no id at all.
    const id =
      /\/desc\/(-?\d+)/.exec(url ?? '')?.[1] ??
      (typeof j.id === 'number' && !Number.isSafeInteger(j.id) ? '' : str(j.id));
    if (!id || !title || !url) continue;
    const location = htmlToText(str(j.location));
    const posted = Date.parse(str(j.updated));
    out.push({
      source: 'jooble',
      sourceId: `jooble:${id}`,
      title,
      company: htmlToText(str(j.company)),
      location: location || undefined,
      remote: isRemoteRole(false, `${title} ${location} ${str(j.type)}`) || undefined,
      url,
      descriptionText: htmlToText(str(j.snippet)),
      postedAt: Number.isNaN(posted) ? undefined : new Date(posted).toISOString(),
    });
  }
  return out;
}

export async function readJooble(ctx: FeedContext): Promise<NormalizedPosting[]> {
  const { JOOBLE_API_KEY: key } = needKeys(ctx, JOOBLE_ENV);
  const seen = new Map<string, NormalizedPosting>();
  let first = true;
  for (const phrase of JOOBLE_PHRASES) {
    if (!first) await ctx.sleep(CALL_GAP_MS);
    first = false;
    const r = await fetchKeyed(ctx, 'Jooble', joobleUrl(key), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(joobleBody(phrase)),
    });
    if (!r.ok) throw new SourceHttpError('Jooble', r.status);
    for (const p of parseJooble(await r.json())) if (!seen.has(p.sourceId)) seen.set(p.sourceId, p);
  }
  return [...seen.values()];
}
