// SAM.gov contract opportunities, read through the app's own /api/sam (src/contracts/samHandler.ts
// holds the key; the browser never sees it, and CSP stays 'self'). One request per search; an
// answer is kept in memory for an hour. A failure says what the function said, word for word, so
// a missing key reads "SAM_GOV_API_KEY is not set: …" on the source row.
import type { SamOpportunity } from '../../contracts/sam';
import type { Posting } from '../types';
import { FetchError, stampSeen } from './http';

export interface SamRequest {
  naics: string[];
  /** Two-letter state; absent = all states. */
  state?: string;
}

/** The function's own words (an error it answered with), shown as they are. */
export class SourceMessageError extends Error {}

export const samUrl = ({ naics, state }: SamRequest) => {
  const q = new URLSearchParams({ naics: naics.join(',') });
  if (state) q.set('state', state);
  return `/api/sam?${q}`;
};

const TTL_MS = 60 * 60 * 1000;
const cache = new Map<string, { at: number; postings: Posting[] }>();
/** Tests start from an empty cache. */
export const clearSamCache = () => cache.clear();

export function postingOf(o: SamOpportunity): Posting {
  const place = [o.city, o.state].filter(Boolean).join(', ');
  const text = [
    o.responseDeadline && `Response due ${o.responseDeadline}`,
    o.type && `Notice type: ${o.type}`,
    o.naics && `NAICS ${o.naics}`,
    o.setAside && `Set-aside: ${o.setAside}`,
    o.solicitationNumber && `Solicitation ${o.solicitationNumber}`,
  ]
    .filter(Boolean)
    .join('\n');
  const p: Posting = {
    id: `sam:${o.id}`,
    source: 'sam',
    title: o.title,
    company: o.agency,
    url: o.url,
    location: place,
    text,
  };
  if (o.postedDate) p.postedAt = o.postedDate;
  if (o.responseDeadline) p.deadline = o.responseDeadline;
  return p;
}

const errorOf = (body: unknown): string => {
  const e = (body as { error?: unknown } | null)?.error;
  return typeof e === 'string' ? e.slice(0, 300) : '';
};

export async function fetchSam(
  req: SamRequest,
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response> = (u, i) => fetch(u, i),
  now: () => number = Date.now,
): Promise<Posting[]> {
  if (!req.naics.length) return [];
  const url = samUrl(req);
  const hit = cache.get(url);
  if (hit && now() - hit.at < TTL_MS) return hit.postings;
  let res: Response;
  try {
    res = await fetchImpl(url, { headers: { Accept: 'application/json' } });
  } catch {
    throw new FetchError(0, url);
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const said = errorOf(body);
    if (said) throw new SourceMessageError(said);
    // No JSON: the function is not there (a local dev or preview server has no /api).
    if (res.status === 404)
      throw new SourceMessageError(
        'the contracts function isn’t running here. It runs on the deployed site.',
      );
    throw new FetchError(res.status, url);
  }
  const list = (body as { opportunities?: unknown } | null)?.opportunities;
  if (!Array.isArray(list)) throw new FetchError(502, url);
  const postings = stampSeen(
    (list as SamOpportunity[])
      .filter((o) => o && typeof o.id === 'string' && /^https:\/\/sam\.gov\//.test(o.url ?? ''))
      .map(postingOf),
  );
  cache.set(url, { at: now(), postings });
  return postings;
}
