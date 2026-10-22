// Remote OK — a remote-jobs board with a public, keyless API (UNVERIFIED LIVE: written from the
// documented response shape; this build environment cannot reach remoteok.com).
//   GET https://remoteok.com/api  →  [ { legal notice }, { job }, ... ]
// The first element is a legal notice, not a job, and is dropped. The API has no search, so the
// term is matched here. Their terms are an attribution rule, kept as hard behaviour: every row links
// to the job's own Remote OK `url`, exactly as given and followed (never rewritten, never
// `nofollow`), and shows "Remote OK" as its source. Their logo is never used. Off by default
// (`SOURCE_ENABLED.remoteok` in fetchFeed.ts) until the live `legal` notice has been read and checked.
import { htmlToText } from '../html';
import { matchTerm } from '../match';
import { httpUrl } from '../../httpUrl';
import type { Posting } from '../types';
import { arr, num, obj, str, type FetchJson } from './http';

export const REMOTEOK_URL = 'https://remoteok.com/api';

export function parseRemoteOkJob(j: unknown): Posting | null {
  const o = obj(j);
  const id = String(o.id ?? '');
  const url = httpUrl(str(o.url));
  // The legal notice has `legal` and no id/url, so it falls out here too.
  if (!id || !url || 'legal' in o) return null;
  const tags = arr(o.tags).map(str).filter(Boolean);
  const salaryMin = num(o.salary_min);
  const salaryMax = num(o.salary_max);
  const p: Posting = {
    id: `remoteok:${id}`,
    source: 'remoteok',
    title: str(o.position),
    company: str(o.company),
    url,
    location: str(o.location),
    mode: 'remote',
    postedAt: str(o.date) || undefined,
    text: [tags.length > 0 && `Tags: ${tags.join(', ')}`, htmlToText(str(o.description))]
      .filter(Boolean)
      .join('\n'),
  };
  if (salaryMin !== undefined) p.salaryMin = salaryMin;
  if (salaryMax !== undefined) p.salaryMax = salaryMax;
  // Remote OK states yearly pay in US dollars.
  if (salaryMin !== undefined || salaryMax !== undefined) p.currency = 'USD';
  return p;
}

export async function fetchRemoteOk(term: string, fetchJson: FetchJson): Promise<Posting[]> {
  const body = await fetchJson(REMOTEOK_URL);
  return arr(body)
    .map(parseRemoteOkJob)
    .filter((p): p is Posting => !!p && matchTerm(p, term) !== null);
}
