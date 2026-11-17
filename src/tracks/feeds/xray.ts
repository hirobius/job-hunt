// The ATS x-ray search (#389 brought back, on the server): web searches such as
// `(site:boards.greenhouse.io OR site:job-boards.greenhouse.io) "design system"` over every ATS host
// the sync can read. Each result link that is a company board (parseBoardUrl) is a board found; the
// sync stores it in `found_boards` and the scan rotation reads it like a boards.json board, so its
// postings reach every design-systems user through the board's own API, scored as usual.
// The search answer itself is never stored or shown: only the board's kind and slug are kept, with
// the result link as evidence (docs/research/job-sources-2026-11.md, "Search APIs").
//
// Providers (each one runs when its secret is set; with both, both run and their boards merge):
//   Brave Search API  GET https://api.search.brave.com/res/v1/web/search?q&count&offset&freshness
//                     header X-Subscription-Token: <BRAVE_SEARCH_API_KEY>
//                     → { web: { results: [{ title, url, description, age? }] } }
//                     Cost: a monthly free credit (about 1,000 calls, api-dashboard.search.brave.com);
//                     we spend XRAY_CALLS_PER_RUN a day, ~300 a month.
//   Google Programmable Search JSON API
//                     GET https://www.googleapis.com/customsearch/v1?key&cx&q&num&start&dateRestrict
//                     → { items: [{ title, link, snippet }] }
//                     100 calls a day free. Closed to new sign-ups and ends 2027-01-01 (Google), so
//                     it only helps a key made before; Brave is the one to set up.
//   Tavily  POST https://api.tavily.com/search  Bearer <TAVILY_API_KEY>  1,000 credits a month free
//   Exa     POST https://api.exa.ai/search      x-api-key <EXA_API_KEY>  monthly free credit
//           Both take the hosts as a domain filter and have no paging: page 0 of each host only.
//           → { results: [{ url, title }] }  (shapes from their docs, unverified live)
// None is ever a Google results page (its terms ban that), and no Workday, SuccessFactors, Taleo
// or Oracle host is searched or fetched. The browser never contacts either API (no CSP entry);
// legal.ts names them as services our server reads. Keys ride in a header (Brave) or the URL
// (Google): fetchKeyed and SourceHttpError never log a URL.
import { parseBoardUrl, type BoardKind } from '../../feed/sources/boardUrl.ts';
import { setBoardKey, type SetBoard } from '../../feed/boardSet.ts';
import { fetchKeyed, SourceHttpError, type FeedContext } from './context.ts';

export const BRAVE_ENV = ['BRAVE_SEARCH_API_KEY'] as const;
export const GOOGLE_CSE_ENV = ['GOOGLE_CSE_API_KEY', 'GOOGLE_CSE_ID'] as const;
/** Any of these set turns the x-ray on (a provider with one secret missing is skipped, logged). */
export const TAVILY_ENV = ['TAVILY_API_KEY'] as const;
export const EXA_ENV = ['EXA_API_KEY'] as const;
export const XRAY_ENV = [...BRAVE_ENV, ...GOOGLE_CSE_ENV, ...TAVILY_ENV, ...EXA_ENV] as const;

export const BRAVE_URL = 'https://api.search.brave.com/res/v1/web/search';
export const GOOGLE_CSE_URL = 'https://www.googleapis.com/customsearch/v1';
export const TAVILY_URL = 'https://api.tavily.com/search';
export const EXA_URL = 'https://api.exa.ai/search';
/** Tavily and Exa take the domains as a parameter, not `site:`, and the phrases plainly. */
export const PLAIN_QUERY = '"design system" OR "design technologist" OR "design engineer" job';

/** The role words, ORed in one clause (both APIs read OR and quotes). */
export const XRAY_PHRASES =
  '("design system" OR "design systems" OR "design technologist" OR "design engineer")';

/** Every ATS host the sync can read, as a site clause per board kind. Same kinds as
 *  boardSet.ts BOARD_KINDS (xray.test.ts pins it). */
export const XRAY_SITES: readonly { kind: BoardKind; site: string }[] = [
  { kind: 'greenhouse', site: '(site:boards.greenhouse.io OR site:job-boards.greenhouse.io)' },
  { kind: 'lever', site: '(site:jobs.lever.co OR site:jobs.eu.lever.co)' },
  { kind: 'ashby', site: 'site:jobs.ashbyhq.com' },
  { kind: 'workable', site: 'site:apply.workable.com' },
  { kind: 'smartrecruiters', site: 'site:jobs.smartrecruiters.com' },
  { kind: 'recruitee', site: 'site:recruitee.com' },
  { kind: 'teamtailor', site: 'site:teamtailor.com' },
  { kind: 'personio', site: '(site:jobs.personio.de OR site:jobs.personio.com)' },
  { kind: 'bamboohr', site: 'site:bamboohr.com' },
  { kind: 'rippling', site: 'site:ats.rippling.com' },
  { kind: 'gem', site: 'site:jobs.gem.com' },
  { kind: 'pinpoint', site: 'site:pinpointhq.com' },
  { kind: 'breezy', site: 'site:breezy.hr' },
];

/** Pages asked per query: the big hosts have more than one page of answers. */
export const XRAY_PAGES = 3;
/** Calls per provider on one morning run: the slots rotate by day, so every query and page is
 *  asked about every ceil(slots / calls) days (13 × 3 / 10 → every 4 days). */
export const XRAY_CALLS_PER_RUN = 10;
export const BRAVE_COUNT = 20;
export const GOOGLE_NUM = 10;
export const CALL_GAP_MS = 1100; // Brave's base rate is 1 call a second

export interface XraySlot {
  kind: BoardKind;
  query: string;
  /** 0-based page. */
  page: number;
}

export const xrayQuery = (site: string) => `${site} ${XRAY_PHRASES}`;

/** The hosts a slot's site clause names (Tavily's and Exa's domain filter). */
export const slotDomains = (s: Pick<XraySlot, 'query'>) =>
  [...s.query.matchAll(/site:([a-z0-9.-]+)/gi)].map((m) => m[1]!.toLowerCase());

/** Tavily: POST { query, include_domains, max_results, time_range }, Bearer key. Basic search is
 *  1 credit; the free plan has 1,000 a month (docs.tavily.com). No paging: page 0 slots only. */
export const tavilyBody = (s: XraySlot) => ({
  query: PLAIN_QUERY,
  include_domains: slotDomains(s),
  max_results: 20,
  time_range: 'month',
  search_depth: 'basic',
});

/** Exa: POST { query, includeDomains, numResults, startPublishedDate }, x-api-key. No paging. */
export const exaBody = (s: XraySlot, now: Date) => ({
  query: PLAIN_QUERY,
  includeDomains: slotDomains(s),
  numResults: 25,
  startPublishedDate: new Date(now.getTime() - 30 * 86_400_000).toISOString(),
});

/** Every (query, page) the x-ray asks, page 0 of every host first. */
export function xraySlots(): XraySlot[] {
  const out: XraySlot[] = [];
  for (let page = 0; page < XRAY_PAGES; page++)
    for (const s of XRAY_SITES) out.push({ kind: s.kind, query: xrayQuery(s.site), page });
  return out;
}

/** The slots one run asks: a window of `n` that moves by `n` each UTC day, wrapping. */
export function slotsForRun(now: Date, n = XRAY_CALLS_PER_RUN): XraySlot[] {
  const all = xraySlots();
  const day = Math.floor(now.getTime() / 86_400_000);
  const start = (day * n) % all.length;
  return Array.from({ length: Math.min(n, all.length) }, (_, i) => all[(start + i) % all.length]!);
}

export const braveUrl = (s: XraySlot) => {
  const u = new URL(BRAVE_URL);
  u.searchParams.set('q', s.query);
  u.searchParams.set('count', String(BRAVE_COUNT));
  u.searchParams.set('offset', String(s.page));
  u.searchParams.set('freshness', 'pm');
  return u.toString();
};

export const googleUrl = (key: string, cx: string, s: XraySlot) => {
  const u = new URL(GOOGLE_CSE_URL);
  u.searchParams.set('key', key);
  u.searchParams.set('cx', cx);
  u.searchParams.set('q', s.query);
  u.searchParams.set('num', String(GOOGLE_NUM));
  u.searchParams.set('start', String(1 + s.page * GOOGLE_NUM));
  u.searchParams.set('dateRestrict', 'm1');
  return u.toString();
};

export interface SearchHit {
  url: string;
  title: string;
}

type O = Record<string, unknown>;
const obj = (v: unknown): O =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as O) : {};
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const hits = (rows: unknown, urlKey: string): SearchHit[] =>
  (Array.isArray(rows) ? rows : [])
    .map((r) => ({ url: str(obj(r)[urlKey]), title: str(obj(r).title) }))
    .filter((h) => /^https?:\/\//i.test(h.url));

export const parseBrave = (json: unknown): SearchHit[] => hits(obj(obj(json).web).results, 'url');
export const parseGoogle = (json: unknown): SearchHit[] => hits(obj(json).items, 'link');
/** Tavily and Exa both answer { results: [{ url, title }] }. */
export const parseResults = (json: unknown): SearchHit[] => hits(obj(json).results, 'url');

/** The company a result title names: Greenhouse "Job Application for X at Acme", Lever / Ashby
 *  "Acme - X", else the slug in title case. A guess for display only: the board key is the id. */
export function companyFromHit(title: string, slug: string): string {
  const at = /\bat\s+(.{2,60}?)\s*$/i.exec(title.replace(/\s*[|–—-]\s*[^|–—-]*$/, ''));
  if (/^job application for /i.test(title) && at) return at[1]!.trim();
  const dash = /^([^|–—-]{2,60}?)\s+[–—-]\s+/.exec(title);
  if (dash && !/design/i.test(dash[1]!)) return dash[1]!.trim();
  return slug
    .split(/[-_.]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(' ');
}

/** The boards the hits link to, once each (first hit wins), as set boards dated `day`. */
export function boardsFromHits(found: readonly SearchHit[], day: string): SetBoard[] {
  const out = new Map<string, SetBoard>();
  for (const h of found) {
    const b = parseBoardUrl(h.url);
    if (!b) continue;
    const board: SetBoard = {
      kind: b.kind,
      slug: b.slug,
      ...(b.eu && { eu: true as const }),
      company: companyFromHit(h.title, b.slug),
      lastChecked: day,
      evidence: `x-ray search: ${h.url}`.slice(0, 300),
    };
    const key = setBoardKey(board);
    if (!out.has(key)) out.set(key, board);
  }
  return [...out.values()];
}

export interface XrayRun {
  boards: SetBoard[];
  /** Provider calls made. */
  calls: number;
  /** One line per failed call or provider skipped, never a key or URL. */
  errors: string[];
}

type Provider = {
  name: string;
  /** False: no paging, so it asks page 0 of every host instead (Tavily, Exa). */
  paged: boolean;
  request: (s: XraySlot) => { url: string; init?: RequestInit };
  parse: (json: unknown) => SearchHit[];
};

const postJson = (headers: Record<string, string>, body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', accept: 'application/json', ...headers },
  body: JSON.stringify(body),
});

function providers(ctx: FeedContext, errors: string[]): Provider[] {
  const v = (n: string) => ctx.env(n)?.trim() ?? '';
  const out: Provider[] = [];
  const brave = v('BRAVE_SEARCH_API_KEY');
  if (brave)
    out.push({
      name: 'Brave Search',
      paged: true,
      request: (s) => ({
        url: braveUrl(s),
        init: { headers: { accept: 'application/json', 'x-subscription-token': brave } },
      }),
      parse: parseBrave,
    });
  const gKey = v('GOOGLE_CSE_API_KEY');
  const gCx = v('GOOGLE_CSE_ID');
  if (gKey && gCx)
    out.push({
      name: 'Google Programmable Search',
      paged: true,
      request: (s) => ({ url: googleUrl(gKey, gCx, s) }),
      parse: parseGoogle,
    });
  else if (gKey || gCx)
    errors.push(
      `Google Programmable Search: ${gKey ? 'GOOGLE_CSE_ID' : 'GOOGLE_CSE_API_KEY'} is not set`,
    );
  const tavily = v('TAVILY_API_KEY');
  if (tavily)
    out.push({
      name: 'Tavily',
      paged: false,
      request: (s) => ({
        url: TAVILY_URL,
        init: postJson({ authorization: `Bearer ${tavily}` }, tavilyBody(s)),
      }),
      parse: parseResults,
    });
  const exa = v('EXA_API_KEY');
  if (exa)
    out.push({
      name: 'Exa',
      paged: false,
      request: (s) => ({
        url: EXA_URL,
        init: postJson({ 'x-api-key': exa }, exaBody(s, ctx.now())),
      }),
      parse: parseResults,
    });
  return out;
}

/** One x-ray run: this day's slots on every provider whose secrets are set. A failed call is
 *  logged and the run goes on; a 401/403/429 stops that provider for the run. */
export async function runXray(ctx: FeedContext, n = XRAY_CALLS_PER_RUN): Promise<XrayRun> {
  const errors: string[] = [];
  const found: SearchHit[] = [];
  let calls = 0;
  const slots = slotsForRun(ctx.now(), n);
  // Page 0 of every host, for the providers with no paging, in the same day rotation.
  const firstPages = xraySlots().filter((s) => s.page === 0);
  const day = Math.floor(ctx.now().getTime() / 86_400_000);
  const firsts = Array.from(
    { length: Math.min(n, firstPages.length) },
    (_, i) => firstPages[(day * n + i) % firstPages.length]!,
  );
  for (const p of providers(ctx, errors)) {
    for (const slot of p.paged ? slots : firsts) {
      const req = p.request(slot);
      if (calls) await ctx.sleep(CALL_GAP_MS);
      calls++;
      try {
        const r = await fetchKeyed(ctx, p.name, req.url, req.init);
        if (!r.ok) throw new SourceHttpError(p.name, r.status);
        found.push(...p.parse(await r.json()));
      } catch (e) {
        errors.push(String(e instanceof Error ? e.message : e).slice(0, 200));
        const status = e instanceof SourceHttpError ? e.status : 0;
        if (status === 401 || status === 403 || status === 429) break;
      }
    }
  }
  return { boards: boardsFromHits(found, ctx.now().toISOString().slice(0, 10)), calls, errors };
}

/** The set the rotation walks: the snapshot plus boards found, each key once (the snapshot's entry
 *  wins), sorted by key like parseBoardSet. */
export function withFoundBoards(set: readonly SetBoard[], found: readonly SetBoard[]): SetBoard[] {
  if (!found.length) return [...set];
  const seen = new Set(set.map(setBoardKey));
  const extra = found.filter((b) => {
    const k = setBoardKey(b);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return [...set, ...extra].sort((a, b) => (setBoardKey(a) < setBoardKey(b) ? -1 : 1));
}
