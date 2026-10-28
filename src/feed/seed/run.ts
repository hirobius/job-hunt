// Seed step 3: read every source, merge, resolve each company's board and build the snapshot that
// `npm run seed:companies` writes to src/feed/data/ds-companies.json (and the watched list,
// ds-seed-boards.json). Network is injected: tests hand in canned bodies; the script hands in fetch.
// A source that fails is recorded with its error and the run carries on with the rest.
import { createLimiter, type Limiter } from '../probe';
import { FetchError, type FetchJson } from '../sources/http';
import {
  HN_API,
  SEED_SOURCES,
  hnThreads,
  mergeCandidates,
  parseAdele,
  parseAwesome,
  parseDsjFeed,
  parseDsjSitemap,
  parseGithubSearch,
  parseHnHits,
  type Candidate,
  type Evidence,
  type SeedSourceId,
} from './parse';
import { resolveCandidate, type SeedBoard } from './resolve';

export const AWESOME_README =
  'https://raw.githubusercontent.com/alexpate/awesome-design-systems/master/README.md';
export const DSJ_SITEMAP = 'https://designsystems.jobs/sitemap.xml';
export const DSJ_FEED = 'https://designsystems.jobs/feed';
export const GITHUB_SEARCH = 'https://api.github.com/search/repositories';
/** Monthly "Who is hiring?" threads read (two years). */
export const HN_MONTHS = 24;
/** GitHub search pages (100 repositories each); keyless search allows 10 a minute. */
export const GITHUB_PAGES = 3;

export interface SourceReport {
  id: SeedSourceId;
  label: string;
  url: string;
  licence: string;
  /** Companies the source named (before merging). */
  companies: number;
  /** '' when it read; else why not. */
  error: string;
}

export interface SeedCompany {
  name: string;
  website: string;
  board: SeedBoard | null;
  /** found / missed / unknown, as the probe left it. */
  state: 'found' | 'missed' | 'unknown';
  evidence: Evidence[];
  licence: string[];
}

export interface Snapshot {
  generated: string;
  note: string;
  sources: SourceReport[];
  counts: { companies: number; boards: number; confirmed: number };
  companies: SeedCompany[];
}

export interface RunOptions {
  fetchText: (url: string) => Promise<string>;
  fetchJson: FetchJson;
  adele: { companies: { name: string; site: string }[] };
  now?: () => Date;
  limiter?: Limiter;
  onProgress?: (done: number, total: number) => void;
  hnMonths?: number;
  githubPages?: number;
}

const why = (e: unknown) =>
  e instanceof FetchError
    ? `HTTP ${e.status || 'unreachable'}`
    : e instanceof Error
      ? e.message
      : String(e);

async function readSources(o: RunOptions): Promise<{ list: Candidate[]; reports: SourceReport[] }> {
  const reports: SourceReport[] = [];
  const list: Candidate[] = [];
  const take = async (id: SeedSourceId, read: () => Promise<Candidate[]>) => {
    const s = SEED_SOURCES[id];
    try {
      const found = await read();
      list.push(...found);
      reports.push({ ...s, companies: found.length, error: '' });
    } catch (e) {
      reports.push({ ...s, companies: 0, error: why(e) });
    }
  };
  await take('adele', async () => parseAdele(o.adele));
  await take('awesome', async () => parseAwesome(await o.fetchText(AWESOME_README)));
  await take('dsjobs', async () => [
    // The feed first: its names are spelled as the company spells them.
    ...parseDsjFeed(await o.fetchText(DSJ_FEED)),
    ...parseDsjSitemap(await o.fetchText(DSJ_SITEMAP)),
  ]);
  await take('hn', async () => {
    const listing = await o.fetchJson(
      `${HN_API}/search_by_date?tags=story,author_whoishiring&hitsPerPage=100`,
    );
    const out: Candidate[] = [];
    for (const id of hnThreads(listing, o.hnMonths ?? HN_MONTHS)) {
      const q = new URLSearchParams({
        tags: `comment,story_${id}`,
        query: 'design system',
        hitsPerPage: '500',
      });
      out.push(...parseHnHits(await o.fetchJson(`${HN_API}/search?${q}`), id));
    }
    return out;
  });
  await take('github', async () => {
    const out: Candidate[] = [];
    for (let page = 1; page <= (o.githubPages ?? GITHUB_PAGES); page++) {
      const q = new URLSearchParams({
        q: 'topic:design-system',
        sort: 'stars',
        per_page: '100',
        page: String(page),
      });
      out.push(...parseGithubSearch(await o.fetchJson(`${GITHUB_SEARCH}?${q}`)));
    }
    return out;
  });
  return { list, reports };
}

const boardKey = (b: SeedBoard) => `${b.kind}:${b.slug.toLowerCase()}`;
const RANK = { linked: 4, domain: 3, title: 2, name: 1 } as const;
const rank = (b: SeedBoard | null) => (b?.confirmed ? RANK[b.confirmed] : 0);

export async function buildSnapshot(o: RunOptions): Promise<Snapshot> {
  const { list, reports } = await readSources(o);
  const candidates = mergeCandidates(list);
  const limiter = o.limiter ?? createLimiter();
  const resolved: SeedCompany[] = new Array(candidates.length);
  let done = 0;
  let next = 0;
  // Six companies at once; the limiter, not this, bounds the requests per host.
  const worker = async () => {
    while (next < candidates.length) {
      const i = next++;
      const c = candidates[i];
      const r = await resolveCandidate(c, { fetchJson: o.fetchJson, limiter });
      resolved[i] = {
        name: c.name,
        website: c.website,
        board: r.board,
        state: r.state,
        evidence: c.evidence,
        licence: [...new Set(c.evidence.map((e) => SEED_SOURCES[e.source].licence))],
      };
      o.onProgress?.(++done, candidates.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, candidates.length) }, worker));

  // Two companies on one board (a parent and its brand): the better-confirmed one keeps it and
  // takes the other's evidence; the other keeps its row without a board.
  const owner = new Map<string, SeedCompany>();
  for (const c of resolved) {
    if (!c.board) continue;
    const k = boardKey(c.board);
    const have = owner.get(k);
    if (!have) {
      owner.set(k, c);
      continue;
    }
    const [keep, drop] = rank(c.board) > rank(have.board) ? [c, have] : [have, c];
    owner.set(k, keep);
    for (const e of drop.evidence)
      if (!keep.evidence.some((x) => x.url === e.url)) keep.evidence.push(e);
    keep.licence = [...new Set([...keep.licence, ...drop.licence])];
    drop.board = null;
    drop.state = 'missed';
  }

  const companies = resolved.sort(
    (a, b) => rank(b.board) - rank(a.board) || a.name.localeCompare(b.name),
  );
  const boards = companies.filter((c) => c.board);
  return {
    generated: (o.now?.() ?? new Date()).toISOString().slice(0, 10),
    note:
      'Companies that run a design system, with the job board the probe found for each. Only boards ' +
      'with `confirmed` set are watched (ds-seed-boards.json). Regenerate with `npm run seed:companies`.',
    sources: reports,
    counts: {
      companies: companies.length,
      boards: boards.length,
      confirmed: boards.filter((c) => c.board?.confirmed).length,
    },
    companies,
  };
}

/** The watched list: every confirmed board, its canonical URL, strongest evidence first. */
export const seedBoards = (s: Snapshot): string[] =>
  s.companies.filter((c) => c.board?.confirmed).map((c) => c.board!.url);
