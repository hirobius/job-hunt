// Workable's own cross-company job search (docs/research/job-sources-2026-11.md, ATS rank 1): one
// keyless call searches every Workable customer, so it finds Workable boards nobody follows yet.
// Like the x-ray search (xray.ts) it is a board finder, not a feed: each answer's company board
// (apply.workable.com/<slug>) goes into found_boards, and the scan rotation reads the board with
// the Workable parser the sync already has, so postings keep their usual `workable:` ids.
// UNVERIFIED LIVE: jobs.workable.com is outside the build sandbox's network. The request is from
// its LLM docs (jobs.workable.com/jobs.md, via search) and several scraper write-ups:
//   GET https://jobs.workable.com/api/v1/jobs?query=<term>&workplace=remote&pageToken=<next>
//   → { jobs: [{ id, title, url, company: { title, url, website }, ... }], nextPageToken }
// The board link is read from whichever of the job's link fields parseBoardUrl knows, so a shape
// change drops boards (logged as 0 found), never adds a wrong one. Pinned in workableSearch.test.ts.
// Terms: jobs.workable.com is Workable's public job board; robots.txt (secondary) disallows only
// the /search HTML pages, and we read the documented JSON. Nothing from the answer is stored but
// the board's slug. Rate limit: none published; WORKABLE_QUERIES calls on the morning run, spaced.
import { parseBoardUrl } from '../../feed/sources/boardUrl.ts';
import { setBoardKey, type SetBoard } from '../../feed/boardSet.ts';
import { fetchKeyed, SourceHttpError, type FeedContext } from './context.ts';
import { USER_AGENT } from './dsjobsCatalog.ts';

export const WORKABLE_SEARCH_URL = 'https://jobs.workable.com/api/v1/jobs';
export const WORKABLE_QUERIES = ['design system', 'design technologist', 'design engineer'];
/** Pages per query (each ~20 jobs). */
export const WORKABLE_PAGES = 2;
export const CALL_GAP_MS = 1000;

export const workableSearchUrl = (query: string, pageToken = '') => {
  const u = new URL(WORKABLE_SEARCH_URL);
  u.searchParams.set('query', query);
  u.searchParams.set('workplace', 'remote');
  if (pageToken) u.searchParams.set('pageToken', pageToken);
  return u.toString();
};

type O = Record<string, unknown>;
const obj = (v: unknown): O =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as O) : {};
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** The Workable boards one answer names, and its next page token. */
export function parseWorkableSearch(
  json: unknown,
  day: string,
): { boards: SetBoard[]; next: string } {
  const o = obj(json);
  const out = new Map<string, SetBoard>();
  for (const raw of Array.isArray(o.jobs) ? o.jobs : []) {
    const j = obj(raw);
    const c = obj(j.company);
    const links = [j.url, j.applyUrl, j.shareUrl, c.url, c.careersUrl, c.website].map(str);
    const link = links.find((l) => parseBoardUrl(l)?.kind === 'workable');
    const b = link ? parseBoardUrl(link) : null;
    if (!b) continue;
    const board: SetBoard = {
      kind: 'workable',
      slug: b.slug,
      company: (str(c.title) || str(c.name) || b.slug).slice(0, 200),
      lastChecked: day,
      evidence: `Workable job search: ${link}`.slice(0, 300),
    };
    const key = setBoardKey(board);
    if (!out.has(key)) out.set(key, board);
  }
  return { boards: [...out.values()], next: str(o.nextPageToken) };
}

/** Every query, up to WORKABLE_PAGES pages each. A failed call ends that query, logged. */
export async function findWorkableBoards(
  ctx: FeedContext,
): Promise<{ boards: SetBoard[]; calls: number; errors: string[] }> {
  const day = ctx.now().toISOString().slice(0, 10);
  const out = new Map<string, SetBoard>();
  const errors: string[] = [];
  let calls = 0;
  for (const q of WORKABLE_QUERIES) {
    let token = '';
    for (let page = 0; page < WORKABLE_PAGES; page++) {
      if (calls) await ctx.sleep(CALL_GAP_MS);
      calls++;
      try {
        const r = await fetchKeyed(ctx, 'Workable job search', workableSearchUrl(q, token), {
          headers: { accept: 'application/json', 'user-agent': USER_AGENT },
        });
        if (!r.ok) throw new SourceHttpError('Workable job search', r.status);
        const { boards, next } = parseWorkableSearch(await r.json(), day);
        for (const b of boards) if (!out.has(setBoardKey(b))) out.set(setBoardKey(b), b);
        if (!next) break;
        token = next;
      } catch (e) {
        errors.push(String(e instanceof Error ? e.message : e).slice(0, 200));
        break;
      }
    }
  }
  return { boards: [...out.values()], calls, errors };
}
