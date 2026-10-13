// Look up one saved job's posting on its public ATS board (Greenhouse, Lever, Ashby), so a pasted
// link gets its real title, company, location and work mode instead of a name guessed from the URL.
// Same keyless, CORS-open APIs the Live postings feed uses (hosts already in the CSP connect-src).
import { parseAshbyJob, parseGreenhouseJob, parseLeverJob } from './sources/ats';
import { arr, obj, type FetchJson } from './sources/http';
import type { Posting } from './types';

export interface PostingRef {
  kind: 'greenhouse' | 'lever' | 'ashby';
  slug: string;
  id: string;
  eu?: boolean;
}

const SLUG = /^[a-z0-9][a-z0-9-]*$/i;

/** The board + posting id a job URL points at, or null for board pages and other sites. */
export function postingRef(raw: string): PostingRef | null {
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  const seg = u.pathname.split('/').filter(Boolean);
  if (host === 'boards.greenhouse.io' || host === 'job-boards.greenhouse.io') {
    const id = seg[1] === 'jobs' ? seg[2] : u.searchParams.get('gh_jid');
    return SLUG.test(seg[0] ?? '') && id && /^\d+$/.test(id)
      ? { kind: 'greenhouse', slug: seg[0], id }
      : null;
  }
  if (host === 'jobs.lever.co' || host === 'jobs.eu.lever.co')
    return SLUG.test(seg[0] ?? '') && seg[1]
      ? { kind: 'lever', slug: seg[0], id: seg[1], eu: host === 'jobs.eu.lever.co' }
      : null;
  if (host === 'jobs.ashbyhq.com')
    return SLUG.test(seg[0] ?? '') && seg[1] ? { kind: 'ashby', slug: seg[0], id: seg[1] } : null;
  return null;
}

/** The posting behind a job URL, or null if it isn't an ATS posting, is gone, or the fetch fails. */
export async function lookupPosting(url: string, fetchJson: FetchJson): Promise<Posting | null> {
  const ref = postingRef(url);
  if (!ref) return null;
  try {
    if (ref.kind === 'greenhouse')
      return parseGreenhouseJob(
        await fetchJson(`https://boards-api.greenhouse.io/v1/boards/${ref.slug}/jobs/${ref.id}`),
        ref.slug,
      );
    if (ref.kind === 'lever')
      return parseLeverJob(
        await fetchJson(
          `https://api${ref.eu ? '.eu' : ''}.lever.co/v0/postings/${ref.slug}/${ref.id}`,
        ),
        ref.slug,
      );
    const board = obj(await fetchJson(`https://api.ashbyhq.com/posting-api/job-board/${ref.slug}`));
    const job = arr(board.jobs).find((j) => obj(j).id === ref.id);
    return job ? parseAshbyJob(job, ref.slug) : null;
  } catch {
    return null;
  }
}
