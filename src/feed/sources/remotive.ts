// Remotive — a curated remote-jobs board with a public, keyless, CORS-open API. Its terms ask that
// we link back to the Remotive URL and credit Remotive as the source: the posting URL is theirs and
// the feed badges every row with its source, so both hold. Search is fuzzy; match.ts filters.
import { htmlToText } from '../html';
import { httpUrl } from '../../httpUrl';
import type { Posting } from '../types';
import { arr, obj, str, type FetchJson } from './http';

export function parseRemotiveJob(j: unknown): Posting | null {
  const o = obj(j);
  const id = String(o.id ?? '');
  const url = httpUrl(str(o.url));
  if (!id || !url) return null;
  // job_type ("contract", "part_time", "freelance") goes into the text so signals see it.
  const jobType = str(o.job_type).replace(/_/g, '-');
  return {
    id: `remotive:${id}`,
    source: 'remotive',
    title: str(o.title),
    company: str(o.company_name),
    url,
    location: str(o.candidate_required_location),
    mode: 'remote',
    postedAt: str(o.publication_date) || undefined,
    text: [jobType && `Job type: ${jobType}`, htmlToText(str(o.description))]
      .filter(Boolean)
      .join('\n'),
  };
}

export async function fetchRemotive(term: string, fetchJson: FetchJson): Promise<Posting[]> {
  const body = await fetchJson(
    `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(term)}&limit=100`,
  );
  return arr(obj(body).jobs)
    .map(parseRemotiveJob)
    .filter((p): p is Posting => !!p);
}
