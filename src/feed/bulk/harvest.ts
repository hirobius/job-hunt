// Bulk board discovery, step 1 (#src-bulk): find public company job-board URLs in public, legal
// sources and turn each into a candidate board. Pure: `discover.ts` validates the candidates with
// the probe and `scripts/discover-boards.mjs` does the fetching. Only facts are kept (a board URL, a
// company name, where we saw it), never a source's prose.
//
// Sources and their terms:
// - Hacker News through the public Algolia HN API (keyless, ~10k requests an hour): every comment
//   that links a board host, searched one host and one time window at a time (Algolia answers at
//   most 1000 hits a query, so a window that holds more is split in two).
// - GitHub job lists on raw.githubusercontent.com: SimplifyJobs' listings.json (MIT) and the
//   README tables of other public lists. Only the board URLs and company names are kept.
// - job-board-aggregator's per-ATS company lists (github.com/Feashliaa/job-board-aggregator, MIT):
//   board slugs for Greenhouse, Lever, Ashby and BambooHR, each one a board id, not a name guess.
// - Common Crawl's URL index (index.commoncrawl.org, CC0-style terms of use: free for any lawful
//   use): CDX queries for each board host's URL pattern. UNVERIFIED from the build container: its
//   proxy refuses the host.
// - The design-system company seed already committed (src/feed/data/ds-companies.json).
// No ATS sitemap is read: Greenhouse, Lever and Ashby publish none for their board hosts.
import { decodeEntities } from '../html.ts';
import { parseBoardUrl, type Board } from '../sources/ats.ts';
import { arr, obj, str } from '../sources/http.ts';

export type HarvestSourceId = 'hn' | 'github' | 'aggregator' | 'commoncrawl' | 'seed';

export interface HarvestSource {
  id: HarvestSourceId;
  label: string;
  url: string;
  licence: string;
}

export const HARVEST_SOURCES: Readonly<Record<HarvestSourceId, HarvestSource>> = {
  hn: {
    id: 'hn',
    label: 'Hacker News comments',
    url: 'https://hn.algolia.com/api',
    licence: 'Facts only (board links, company names); public Algolia HN API',
  },
  github: {
    id: 'github',
    label: 'GitHub job lists',
    url: 'https://github.com/SimplifyJobs/New-Grad-Positions',
    licence: 'Facts only (board links, company names); lists under MIT or no stated licence',
  },
  aggregator: {
    id: 'aggregator',
    label: 'job-board-aggregator company lists',
    url: 'https://github.com/Feashliaa/job-board-aggregator/tree/main/data',
    licence: 'MIT, Copyright (c) 2026 Riley Dorrington; facts only (board slugs)',
  },
  commoncrawl: {
    id: 'commoncrawl',
    label: 'Common Crawl URL index',
    url: 'https://index.commoncrawl.org/',
    licence: 'Common Crawl terms of use (any lawful use); facts only (URLs)',
  },
  seed: {
    id: 'seed',
    label: 'Design-system company seed',
    url: 'https://github.com/hirobius/job-hunt/blob/main/src/feed/data/ds-companies.json',
    licence: 'Ours (src/feed/data/ds-companies.json, each source credited there)',
  },
};

/** A board seen in a source, before the probe has checked it. */
export interface Candidate {
  board: Board;
  /** The company's name, when the source gives one ('' if not). */
  company: string;
  /** The company's own site, when the source gives one. */
  website?: string;
  /** Every source that named it, first one first. */
  sources: HarvestSourceId[];
}

/** The candidate's key, the same as the sync's `boardOf` and boardSet's `setBoardKey`. */
export const candidateKey = (b: Board) =>
  `${b.kind === 'lever' && b.eu ? 'lever.eu' : b.kind}:${b.slug.toLowerCase()}`;

/** Every board host's URL shape, for finding links in free text. */
const BOARD_HOSTS = [
  String.raw`(?:boards|job-boards|boards-api)\.greenhouse\.io/(?:embed/job_board\?for=)?[A-Za-z0-9._-]+`,
  String.raw`jobs\.(?:eu\.)?lever\.co/[A-Za-z0-9._-]+`,
  String.raw`jobs\.ashbyhq\.com/[A-Za-z0-9._%-]+`,
  String.raw`apply\.workable\.com/[A-Za-z0-9._-]+`,
  String.raw`(?:jobs|careers)\.smartrecruiters\.com/[A-Za-z0-9._-]+`,
  String.raw`ats\.rippling\.com/(?:[a-z]{2}-[A-Z]{2}/)?[A-Za-z0-9._-]+`,
  String.raw`jobs\.gem\.com/[A-Za-z0-9._-]+`,
  String.raw`[A-Za-z0-9-]+\.(?:recruitee\.com|teamtailor\.com|jobs\.personio\.(?:de|com)|bamboohr\.com|pinpointhq\.com|breezy\.hr)`,
];
const BOARD_IN_TEXT = new RegExp(String.raw`(?:https?://)?(?:${BOARD_HOSTS.join('|')})`, 'g');

/** Slugs that are a host's own pages, never a company's board. */
const NOT_A_SLUG = new Set([
  'embed',
  'api',
  'v1',
  'jobs',
  'careers',
  'search',
  'login',
  'signup',
  'www',
  'app',
  'help',
  'support',
  'blog',
  'about',
  'privacy',
  'terms',
  'static',
  'assets',
  'marketplace',
  'demo',
  'example',
  'yourcompany',
  'company',
  'companyname',
]);

/** Every distinct board linked in `text` (HTML entities decoded first). */
export function boardsInText(text: string): Board[] {
  const plain = decodeEntities(text.replace(/&#x2F;/gi, '/'));
  const seen = new Set<string>();
  const out: Board[] = [];
  for (const m of plain.matchAll(BOARD_IN_TEXT)) {
    const b = parseBoardUrl(decodeURIComponentSafe(m[0]));
    if (!b || NOT_A_SLUG.has(b.slug.toLowerCase()) || b.slug.length < 2) continue;
    const key = candidateKey(b);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(b);
  }
  return out;
}

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Merge candidates by board key: the first name given wins, sources accumulate. */
export function mergeCandidates(lists: Candidate[][]): Candidate[] {
  const byKey = new Map<string, Candidate>();
  for (const list of lists)
    for (const c of list) {
      const key = candidateKey(c.board);
      const had = byKey.get(key);
      if (!had) byKey.set(key, { ...c, sources: [...c.sources] });
      else {
        if (!had.company && c.company) had.company = c.company;
        if (!had.website && c.website) had.website = c.website;
        for (const s of c.sources) if (!had.sources.includes(s)) had.sources.push(s);
      }
    }
  return [...byKey.values()].sort((a, b) =>
    candidateKey(a.board) < candidateKey(b.board) ? -1 : 1,
  );
}

// ---- Hacker News ----

export const HN_SEARCH = 'https://hn.algolia.com/api/v1/search_by_date';
/** The words Algolia indexes for each board host (it splits URLs on punctuation). */
export const HN_TERMS = [
  'greenhouse.io',
  'lever.co',
  'ashbyhq.com',
  'workable.com',
  'recruitee.com',
  'smartrecruiters.com',
  'teamtailor.com',
  'personio',
  'bamboohr.com',
  'rippling.com',
  'jobs.gem.com',
  'pinpointhq.com',
  'breezy.hr',
];
/** Algolia's cap on hits one query can page through. */
export const HN_MAX_HITS = 1000;

export interface HnWindow {
  term: string;
  from: number;
  to: number;
}

/** One search page's URL: comments matching `term` created in [from, to). */
export const hnUrl = (w: HnWindow, page = 0) =>
  `${HN_SEARCH}?query=${encodeURIComponent(w.term)}&tags=comment&hitsPerPage=${HN_MAX_HITS}&page=${page}` +
  `&numericFilters=${encodeURIComponent(`created_at_i>=${w.from},created_at_i<${w.to}`)}`;

/** Yearly windows from `fromYear` to `now` for every term; `splitWindow` halves a full one. */
export function hnWindows(fromYear: number, now: Date, terms = HN_TERMS): HnWindow[] {
  const end = Math.floor(now.getTime() / 1000);
  const out: HnWindow[] = [];
  for (const term of terms)
    for (let y = fromYear; y <= now.getUTCFullYear(); y++) {
      const from = Math.floor(Date.UTC(y, 0, 1) / 1000);
      const to = Math.min(end, Math.floor(Date.UTC(y + 1, 0, 1) / 1000));
      if (from < to) out.push({ term, from, to });
    }
  return out;
}

/** A window halved, for one whose hits exceed what Algolia pages through. */
export function splitWindow(w: HnWindow): [HnWindow, HnWindow] | null {
  if (w.to - w.from < 3600) return null;
  const mid = Math.floor((w.from + w.to) / 2);
  return [
    { ...w, to: mid },
    { ...w, from: mid },
  ];
}

/** How many hits the window holds, as Algolia counts them. */
export const hnHitCount = (body: unknown) => {
  const n = obj(body).nbHits;
  return typeof n === 'number' ? n : 0;
};

/** The company a hiring comment names: the text before its first "|" on the first line, when it
 *  is short enough to be a name. */
export function hnCompany(html: string): string {
  const first = decodeEntities(html.split(/<p>|\n/i)[0].replace(/<[^>]+>/g, ' '));
  if (!first.includes('|')) return '';
  const head = first
    .split('|')[0]
    .replace(/\(.*?\)/g, ' ')
    .replace(/\bhttps?:\/\/\S+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return head.length >= 2 && head.length <= 60 && head.split(' ').length <= 6 ? head : '';
}

/** Every board linked in one search page's comments. A comment's company name goes only to a
 *  comment that links a single board (one that lists several is often a recruiter's). */
export function parseHnPage(body: unknown): Candidate[] {
  const out: Candidate[] = [];
  for (const h of arr(obj(body).hits).map(obj)) {
    const html = str(h.comment_text);
    if (!html) continue;
    const boards = boardsInText(html);
    const company = boards.length === 1 ? hnCompany(html) : '';
    for (const board of boards) out.push({ board, company, sources: ['hn'] });
  }
  return out;
}

// ---- GitHub lists ----

export const GITHUB_LISTS: readonly { url: string; kind: 'simplify' | 'text' }[] = [
  {
    url: 'https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/.github/scripts/listings.json',
    kind: 'simplify',
  },
  {
    url: 'https://raw.githubusercontent.com/SimplifyJobs/Summer2026-Internships/dev/.github/scripts/listings.json',
    kind: 'simplify',
  },
  {
    url: 'https://raw.githubusercontent.com/SimplifyJobs/Summer2024-Internships/dev/.github/scripts/listings.json',
    kind: 'simplify',
  },
  {
    url: 'https://raw.githubusercontent.com/pittcsc/Summer2024-Internships/dev/README.md',
    kind: 'text',
  },
  {
    url: 'https://raw.githubusercontent.com/speedyapply/2026-SWE-College-Jobs/main/README.md',
    kind: 'text',
  },
  { url: 'https://raw.githubusercontent.com/ReaVNaiL/New-Grad-2024/main/README.md', kind: 'text' },
];

/** SimplifyJobs' listings.json: each listing's `url` (a posting on a board) and `company_name`. */
export function parseSimplifyListings(body: unknown): Candidate[] {
  const out: Candidate[] = [];
  for (const l of arr(body).map(obj))
    for (const board of boardsInText(str(l.url)))
      out.push({ board, company: str(l.company_name).trim().slice(0, 100), sources: ['github'] });
  return out;
}

/** Any other list: every board linked anywhere in its text, no names. */
export const parseTextList = (text: string): Candidate[] =>
  boardsInText(text).map((board) => ({ board, company: '', sources: ['github'] }));

// ---- job-board-aggregator ----

const AGGREGATOR_RAW = 'https://raw.githubusercontent.com/Feashliaa/job-board-aggregator/main/data';
export const AGGREGATOR_LISTS: readonly { url: string; kind: Board['kind'] }[] = (
  ['greenhouse', 'lever', 'ashby', 'bamboohr'] as const
).map((kind) => ({ url: `${AGGREGATOR_RAW}/${kind}_companies.json`, kind }));

const SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** One `<ats>_companies.json`: a list of board slugs on that system. */
export function parseSlugList(body: unknown, kind: Board['kind']): Candidate[] {
  const out: Candidate[] = [];
  for (const v of arr(body)) {
    const slug = str(v).trim();
    if (
      slug.length < 2 ||
      slug.length > 80 ||
      !SLUG.test(slug) ||
      NOT_A_SLUG.has(slug.toLowerCase())
    )
      continue;
    out.push({ board: { kind, slug }, company: '', sources: ['aggregator'] });
  }
  return out;
}

// ---- Common Crawl ----

export const CC_COLLINFO = 'https://index.commoncrawl.org/collinfo.json';
/** The URL patterns asked of the index, one per board host. */
export const CC_PATTERNS = [
  'boards.greenhouse.io/*',
  'job-boards.greenhouse.io/*',
  'jobs.lever.co/*',
  'jobs.eu.lever.co/*',
  'jobs.ashbyhq.com/*',
  'apply.workable.com/*',
  'jobs.smartrecruiters.com/*',
  'ats.rippling.com/*',
  'jobs.gem.com/*',
  '*.recruitee.com',
  '*.teamtailor.com',
  '*.jobs.personio.de',
  '*.bamboohr.com',
  '*.pinpointhq.com',
  '*.breezy.hr',
];

/** The newest `n` crawl index ids from collinfo.json. */
export const ccIndexes = (body: unknown, n: number) =>
  arr(body)
    .map(obj)
    .map((c) => str(c.id))
    .filter((id) => /^CC-MAIN-\d{4}-\d{2}$/.test(id))
    .slice(0, n);

/** One CDX page: URLs only, collapsed to one row per URL key. */
export const ccUrl = (index: string, pattern: string, page = 0) =>
  `https://index.commoncrawl.org/${index}-index?url=${encodeURIComponent(pattern)}&output=json&fl=url&collapse=urlkey&page=${page}`;

/** CDX's `showNumPages` answer for a pattern. */
export const ccPagesUrl = (index: string, pattern: string) =>
  `https://index.commoncrawl.org/${index}-index?url=${encodeURIComponent(pattern)}&showNumPages=true`;

/** The number of pages from a showNumPages answer (`{"pages": N, ...}`), 0 when unreadable. */
export function ccPageCount(text: string): number {
  try {
    const n = obj(JSON.parse(text)).pages;
    return typeof n === 'number' ? n : 0;
  } catch {
    return 0;
  }
}

/** A CDX page (one JSON object per line): every board its URLs point at. */
export function parseCdx(text: string): Candidate[] {
  const out: Candidate[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let url: string;
    try {
      url = str(obj(JSON.parse(line)).url);
    } catch {
      continue;
    }
    for (const board of boardsInText(url))
      out.push({ board, company: '', sources: ['commoncrawl'] });
  }
  return out;
}

// ---- the committed seed ----

/** ds-companies.json: every company whose board the seed confirmed (resolve.ts: linked, domain,
 *  title or name). An unconfirmed one was found under a slug only, so it is left out. */
export function parseSeed(body: unknown): Candidate[] {
  const out: Candidate[] = [];
  for (const c of arr(obj(body).companies).map(obj)) {
    const b = obj(c.board);
    const board = str(b.confirmed) ? parseBoardUrl(str(b.url)) : null;
    if (!board) continue;
    const website = str(c.website);
    out.push({ board, company: str(c.name), ...(website && { website }), sources: ['seed'] });
  }
  return out;
}
