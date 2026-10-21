// Company type-ahead for "Check a list of companies" (rev-3 L). As a name is typed, suggestions come
// from three free, keyless places, merged in this order:
//   1. the user's own companies (watched boards on any track, saved jobs, dream companies, targets),
//   2. the YC directory's community mirror (yc-oss.github.io, its "hiring now" list, read once),
//   3. Wikidata's entity search (wbsearchentities, CORS-open with `origin=*`), company-like only.
// Each network source is failure-isolated: one that times out (5 s) or is blocked just drops out, and
// the typed text can always be added as it is. Answers are cached in memory for the session.
// Both network sources are UNVERIFIED LIVE from the build sandbox (its proxy blocks them).
import { createFetchJson } from './fetchFeed';
import { arr, obj, str, type FetchJson } from './sources/http';
import { boardsFromUrls } from './sources/ats';
import { SOURCE_LABEL } from './types';
import { YC_BASE } from './yc';

export type SuggestSource = 'tracks' | 'yc' | 'wikidata';

export interface CompanySuggestion {
  name: string;
  /** "YC W23, quillstack.example": the source first (an option is one line and may be cut), so a
   *  pick is never a mystery. One meta item, so "Name · detail" keeps the two-item rule (#192). */
  detail: string;
  source: SuggestSource;
}

/** A company the user already has somewhere, with what we know of it. */
export interface KnownCompany {
  name: string;
  detail: string;
}

export const MIN_QUERY = 2;
export const SUGGEST_TIMEOUT_MS = 5_000;
/** The YC mirror's list of companies hiring now: the useful slice for a job hunt. */
export const YC_SUGGEST_URL = `${YC_BASE}companies/hiring.json`;
const PER_SOURCE = 5;

const norm = (s: string) => s.trim().toLowerCase();

/** "https://www.acme.example/about" → "acme.example"; '' for anything that isn't a URL. */
export function domainOf(url: string | undefined): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Every company the user already has, first mention wins: watched boards, saved jobs, dream
 *  companies, then targets. */
export function knownCompanies({
  tiles = [],
  jobs = [],
  dreams = [],
  targets = [],
}: {
  tiles?: { name: string; url: string }[];
  jobs?: { company?: string }[];
  dreams?: { company: string; website?: string }[];
  targets?: { company: string; website?: string }[];
}): KnownCompany[] {
  const out: KnownCompany[] = [];
  const seen = new Set<string>();
  const add = (name: string | undefined, detail: string) => {
    const k = norm(name ?? '');
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push({ name: name!.trim(), detail });
  };
  for (const t of tiles) {
    const [board] = boardsFromUrls([t.url], 1);
    if (board) add(t.name, `${SOURCE_LABEL[board.kind]} board`);
  }
  for (const j of jobs) add(j.company, 'In your Pipeline');
  for (const d of dreams) add(d.company, domainOf(d.website) || 'Dream company');
  for (const t of targets) add(t.company, domainOf(t.website) || 'Target');
  return out;
}

/** True when a word of `name` starts with the query ("quill" matches "Acme Quill"). */
const wordMatch = (name: string, q: string) =>
  norm(name)
    .split(/[^a-z0-9]+/i)
    .some((w) => w.startsWith(q)) || norm(name).startsWith(q);

/** The user's own companies matching the query, prefix matches first, picked names left out. */
export function localSuggestions(
  query: string,
  known: KnownCompany[],
  picked: readonly string[],
): CompanySuggestion[] {
  const q = norm(query);
  if (q.length < MIN_QUERY) return [];
  const taken = new Set(picked.map(norm));
  return known
    .filter((k) => !taken.has(norm(k.name)) && wordMatch(k.name, q))
    .sort((a, b) => Number(!norm(a.name).startsWith(q)) - Number(!norm(b.name).startsWith(q)))
    .slice(0, PER_SOURCE)
    .map((k) => ({ ...k, source: 'tracks' }));
}

/** YC companies whose name matches the query. */
export function parseYcSuggestions(body: unknown, query: string): CompanySuggestion[] {
  const q = norm(query);
  return arr(body)
    .map((raw) => {
      const o = obj(raw);
      return { name: str(o.name).trim(), website: str(o.website), batch: str(o.batch).trim() };
    })
    .filter((c) => c.name && wordMatch(c.name, q))
    .slice(0, PER_SOURCE)
    .map((c) => ({
      name: c.name,
      detail: [c.batch ? `YC ${c.batch}` : 'YC', domainOf(c.website)].filter(Boolean).join(', '),
      source: 'yc' as const,
    }));
}

export const wikidataUrl = (query: string) =>
  `https://www.wikidata.org/w/api.php?${new URLSearchParams({
    action: 'wbsearchentities',
    search: query,
    language: 'en',
    uselang: 'en',
    type: 'item',
    limit: '10',
    format: 'json',
    origin: '*',
  })}`;

// An entity is a company when its short description says so ("American software company").
const COMPANY_WORDS =
  /\b(company|companies|business|corporation|enterprise|startup|start-up|firm|manufacturer|developer|publisher|retailer|brand|bank|agency|conglomerate|subsidiary|employer|organi[sz]ation|studio|consultancy|provider)\b/i;

/** Company-like hits of a wbsearchentities answer, named by their description. */
export function parseWikidata(body: unknown): CompanySuggestion[] {
  return arr(obj(body).search)
    .map((raw) => {
      const o = obj(raw);
      return { name: str(o.label).trim(), description: str(o.description).trim() };
    })
    .filter((e) => e.name && COMPANY_WORDS.test(e.description))
    .slice(0, PER_SOURCE)
    .map((e) => ({ name: e.name, detail: `Wikidata, ${e.description}`, source: 'wikidata' }));
}

/** One list, the first of each name kept (earlier lists win), at most `limit`. */
export function mergeSuggestions(lists: CompanySuggestion[][], limit = 8): CompanySuggestion[] {
  const seen = new Set<string>();
  const out: CompanySuggestion[] = [];
  for (const s of lists.flat()) {
    const k = norm(s.name);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
    if (out.length >= limit) break;
  }
  return out;
}

/** The network half of the type-ahead: YC (its list read once) then Wikidata, each on its own,
 *  answers cached by query. A source that fails gives nothing; it never fails the whole answer. */
export function createCompanySuggester(
  fetchJson: FetchJson,
): (query: string) => Promise<CompanySuggestion[]> {
  const answers = new Map<string, Promise<CompanySuggestion[]>>();
  let yc: Promise<unknown> | null = null;
  const ycList = () => {
    // A failed read is forgotten, so a later keystroke may try again.
    yc ??= fetchJson(YC_SUGGEST_URL).catch((e: unknown) => {
      yc = null;
      throw e;
    });
    return yc;
  };
  const quiet = <T>(p: Promise<T[]>) => p.catch(() => [] as T[]);
  return (query: string) => {
    const q = norm(query);
    if (q.length < MIN_QUERY) return Promise.resolve([]);
    let hit = answers.get(q);
    if (!hit) {
      hit = Promise.all([
        quiet(ycList().then((b) => parseYcSuggestions(b, q))),
        quiet(fetchJson(wikidataUrl(q)).then(parseWikidata)),
      ]).then((lists) => mergeSuggestions(lists));
      answers.set(q, hit);
    }
    return hit;
  };
}

/** The app's suggester: its own 5 s fetcher with an in-memory cache. */
let shared: ((query: string) => Promise<CompanySuggestion[]>) | null = null;
export const suggestCompanies = (query: string) =>
  (shared ??= createCompanySuggester(createFetchJson({ timeoutMs: SUGGEST_TIMEOUT_MS })))(query);
