// Adzuna job search (docs/research/ds-job-sources.md, ranking 9). Server only; OFF until keys are
// set and Adzuna has said yes to our use (SOURCE_ENABLED.adzuna). UNVERIFIED LIVE: the host
// answered from the build sandbox (400 without keys), but no keys were available, so the answer
// shape is from developer.adzuna.com's docs, pinned in adzuna.test.ts.
//   GET https://api.adzuna.com/v1/api/jobs/<country>/search/1?app_id=…&app_key=…
//       &what_phrase=design%20system&results_per_page=50&max_days_old=14&sort_by=date
//   → { count, results: [{ id, title, description, redirect_url, created, company.display_name,
//        location.display_name, … }] }
// Terms (developer.adzuna.com/docs/terms_of_service): every result must show "Jobs by Adzuna"
// (SOURCE_LABEL.adzuna says exactly that on each row) and link through its `redirect_url` as
// given; free keys allow 25 calls a minute, 250 a day, 1,000 a week, 2,500 a month; commercial use
// is a 14-day trial, then a licence, so Adrian asks Adzuna before this is turned on. Keys are
// Supabase function secrets (ADZUNA_APP_ID, ADZUNA_APP_KEY), never in the app bundle: the browser
// never contacts Adzuna (no CSP entry); legal.ts names it as a service our server reads.
// Budget: COUNTRIES × PHRASES = 8 calls on the morning run, CALL_GAP_MS apart (under 25 a minute;
// 248 a month).
import { htmlToText } from '../../feed/html.ts';
import { inferMode } from '../../feed/mode.ts';
import { httpUrl } from '../../httpUrl.ts';
import type { NormalizedPosting } from '../score.ts';
import { fetchKeyed, needKeys, SourceHttpError, type FeedContext } from './context.ts';

export const ADZUNA_ENV = ['ADZUNA_APP_ID', 'ADZUNA_APP_KEY'] as const;
export const ADZUNA_COUNTRIES = ['us', 'gb', 'ca', 'de'] as const;
export const ADZUNA_PHRASES = ['design system', 'design systems'] as const;
export const CALL_GAP_MS = 2500;

export function adzunaUrl(country: string, phrase: string, id: string, key: string): string {
  const q = new URLSearchParams({
    app_id: id,
    app_key: key,
    what_phrase: phrase,
    results_per_page: '50',
    max_days_old: '14',
    sort_by: 'date',
  });
  return `https://api.adzuna.com/v1/api/jobs/${country}/search/1?${q}`;
}

type O = Record<string, unknown>;
const obj = (v: unknown): O =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as O) : {};
const str = (v: unknown) =>
  typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';

export function parseAdzuna(json: unknown): NormalizedPosting[] {
  const rows = obj(json).results;
  if (!Array.isArray(rows)) return [];
  const out: NormalizedPosting[] = [];
  for (const raw of rows) {
    const j = obj(raw);
    const id = str(j.id);
    // Titles carry <strong> highlights.
    const title = htmlToText(str(j.title));
    const url = httpUrl(str(j.redirect_url));
    if (!id || !title || !url) continue;
    const location = htmlToText(str(obj(j.location).display_name));
    const posted = Date.parse(str(j.created));
    out.push({
      source: 'adzuna',
      sourceId: `adzuna:${id}`,
      title,
      company: htmlToText(str(obj(j.company).display_name)),
      location: location || undefined,
      remote: inferMode(`${title} ${location}`) === 'remote' || undefined,
      url,
      descriptionText: htmlToText(str(j.description)),
      postedAt: Number.isNaN(posted) ? undefined : new Date(posted).toISOString(),
    });
  }
  return out;
}

/** Every country × phrase, one at a time; a posting found twice is kept once. One call failing
 *  fails the read (the caller logs it), so a partial answer never stands for the whole. */
export async function readAdzuna(ctx: FeedContext): Promise<NormalizedPosting[]> {
  const { ADZUNA_APP_ID: id, ADZUNA_APP_KEY: key } = needKeys(ctx, ADZUNA_ENV);
  const seen = new Map<string, NormalizedPosting>();
  let first = true;
  for (const country of ADZUNA_COUNTRIES)
    for (const phrase of ADZUNA_PHRASES) {
      if (!first) await ctx.sleep(CALL_GAP_MS);
      first = false;
      const r = await fetchKeyed(ctx, `Adzuna ${country}`, adzunaUrl(country, phrase, id, key));
      if (!r.ok) throw new SourceHttpError(`Adzuna ${country}`, r.status);
      for (const p of parseAdzuna(await r.json()))
        if (!seen.has(p.sourceId)) seen.set(p.sourceId, p);
    }
  return [...seen.values()];
}
