// Jobicy — a remote-jobs board with a public, keyless API (UNVERIFIED LIVE: written from the
// documented response shape; this build environment cannot reach jobicy.com).
//   GET https://jobicy.com/api/v2/remote-jobs?count=50&tag=<term>  →  { jobs: [...] }
// Terms we honour: link to the job's own Jobicy `url`, show "Jobicy" as the source on every row (the
// feed does), poll no more than hourly (the 1 hour in-memory cache), treat 429 as rate-limited and
// show sanitized text only (htmlToText). Only about the last 7 days of jobs appear. Every field is
// optional here; a missing one never drops a row, only a missing id or url does.
import { htmlToText } from '../html.ts';
import { httpUrl } from '../../httpUrl.ts';
import type { Posting } from '../types.ts';
import { arr, num, obj, stampSeen, str, type FetchJson } from './http.ts';

/** Jobicy's `tag` must be 3 to 50 characters. */
const TAG_MIN = 3;
const TAG_MAX = 50;
/** Words in a `tag` Jobicy answers. Live, 2026-11-06 to 2026-11-15: "Design Systems Engineer" got
 *  HTTP 400 on every read, while "design systems" and "design engineer" answered. A longer title
 *  is not asked: it reads as no results, like a tag that is too short, so the feed still counts
 *  as answered and the shorter terms find the same jobs. */
const TAG_WORDS_MAX = 2;

export const jobicyUrl = (term: string) =>
  `https://jobicy.com/api/v2/remote-jobs?count=50&tag=${encodeURIComponent(term.trim())}`;

/** "2026-10-10 09:00:00" (UTC) → ISO; anything else passes through for Date.parse to judge. */
const isoOf = (s: string): string | undefined => {
  if (!s) return undefined;
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})$/.exec(s);
  return m ? `${m[1]}T${m[2]}Z` : s;
};

export function parseJobicyJob(j: unknown): Posting | null {
  const o = obj(j);
  const id = String(o.id ?? '');
  const url = httpUrl(str(o.url));
  if (!id || !url) return null;
  const types = (Array.isArray(o.jobType) ? arr(o.jobType) : [o.jobType]).map(str).filter(Boolean);
  const salaryMin = num(o.annualSalaryMin);
  const salaryMax = num(o.annualSalaryMax);
  const p: Posting = {
    id: `jobicy:${id}`,
    source: 'jobicy',
    title: str(o.jobTitle),
    company: str(o.companyName),
    url,
    location: str(o.jobGeo),
    mode: 'remote',
    postedAt: isoOf(str(o.pubDate)),
    text: [types.length > 0 && `Job type: ${types.join(', ')}`, htmlToText(str(o.jobDescription))]
      .filter(Boolean)
      .join('\n'),
  };
  if (salaryMin !== undefined) p.salaryMin = salaryMin;
  if (salaryMax !== undefined) p.salaryMax = salaryMax;
  if ((salaryMin !== undefined || salaryMax !== undefined) && str(o.salaryCurrency))
    p.currency = str(o.salaryCurrency);
  return p;
}

export async function fetchJobicy(term: string, fetchJson: FetchJson): Promise<Posting[]> {
  const t = term.trim();
  if (t.length < TAG_MIN || t.length > TAG_MAX) return [];
  if (t.split(/\s+/).length > TAG_WORDS_MAX) return [];
  const body = await fetchJson(jobicyUrl(t));
  return stampSeen(
    arr(obj(body).jobs)
      .map(parseJobicyJob)
      .filter((p): p is Posting => !!p),
  );
}
