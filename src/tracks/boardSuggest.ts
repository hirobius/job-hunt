// Board suggestions from the postings we already read (#576 item 5). HN, TheirStack, Adzuna,
// Jooble and the other feeds name companies whose own ATS board nobody follows yet. On each feeds
// run the sync takes a few of those names, asks the three most common ATS APIs whether a board
// answers for the name's slug, and stores each live one as a SUGGESTION for the users who saw the
// company. A suggestion is never followed by itself: the user follows it from Companies.
//
// Rules (boardSuggest.test.ts pins each one):
//   - Names only, never URLs: a name is turned into at most 2 slugs (`acmecorp`, `acme-corp`), one
//     DNS-label-safe slug each, on fixed hosts (SSRF rules, security review 2026-10-27).
//   - Bounded: MAX_NAMES_PER_RUN names, PROBE_KINDS kinds, 2 slugs = at most 72 reads a run; one
//     read at a time per host, GAP_MS apart; `redirect: 'error'`; a body over MAX_BYTES fails.
//   - A name checked in the last RECHECK_DAYS is not asked again (the cache table).
//   - Only a board with at least one open job counts (an empty list is any slug's answer on some
//     systems).
//   - Identity (feed/boardIdentity.ts, the auto-scan's #417 rule): a board found from a name must
//     show it is that company's. It matches when its links or job text carry the domain of the
//     posting's own link (only when that domain is the company's name, companyLogo `postingDomain`),
//     or when the name the board states (Greenhouse's `/v1/boards/<slug>`, a job's company name) is
//     the same name (`nameSimilarity` >= SAME_NAME). A board that says nothing either way counts only
//     when the name is distinct (feed/distinctName.ts: >= 7 letters, not an everyday word) and it is
//     the one live board the name found on any kind. Everything else is unconfirmed: never suggested.
//   - Per user: a name the user follows or ignored (a muted Source) is not probed or suggested for
//     them, and a board they follow is no suggestion.
// Pure apart from the fetch and sleep it is given: the edge function and the tests share it.
import {
  boardJobs,
  greenhouseListUrl,
  boardApiUrl,
  type Board,
  type BoardKind,
} from '../feed/sources/ats.ts';
import {
  boardEvidence,
  identify,
  type BoardEvidence,
  type IdentityVerdict,
} from '../feed/boardIdentity.ts';
import { distinctName } from '../feed/distinctName.ts';
import { postingDomain } from '../companyLogo.ts';
import { guardedFetch } from './boardFetch.ts';

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/** Feed sources whose company names are probed (boards are already followed boards). */
export const SUGGEST_SOURCES: ReadonlySet<string> = new Set([
  'hn',
  'theirstack',
  'adzuna',
  'jooble',
  'remotive',
  'jobicy',
  'arbeitnow',
  'remoteok',
  'wwr',
]);
export const PROBE_KINDS = ['greenhouse', 'lever', 'ashby'] as const satisfies readonly BoardKind[];
type ProbeKind = (typeof PROBE_KINDS)[number];
export const MAX_NAMES_PER_RUN = 12;
export const RECHECK_DAYS = 30;
export const GAP_MS = 250;
export const MAX_BYTES = 4 * 1024 * 1024;

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const SUFFIX = /\b(inc|llc|ltd|limited|gmbh|corp|corporation|co|plc|ag|sa|bv|oy|ab)\b\.?/g;

/** A company name as the cache's key: lower case, spaces folded. */
export const nameKey = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();

/** The slugs a name is asked under (at most 2), or none for a name that looks like a URL. */
export function slugsFor(name: string): string[] {
  const n = nameKey(name);
  if (!n || n.length > 60 || /[/:@]|\.(com|io|co|ai|dev|org|net)\b/.test(n)) return [];
  const words = n
    .replace(/&/g, ' and ')
    .replace(SUFFIX, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  if (!words.length) return [];
  return [...new Set([words.join(''), words.join('-')])].filter((s) => SLUG.test(s));
}

export interface SeenRow {
  user_id: string;
  company: string;
  source: string;
  /** The posting's link: its domain is identity evidence when it carries the company's name. */
  url?: string;
}

/** A name to probe: who saw it, and the company domains its postings linked to. */
export interface ProbeName {
  name: string;
  key: string;
  users: string[];
  websites?: string[];
}

const MAX_WEBSITES = 3;

/** The names to probe this run, and who saw each one. `skip` holds, per user, the name keys that
 *  user follows or ignored: that user's row does not count (another user's still can). Skips
 *  names checked within RECHECK_DAYS and names with no usable slug. */
export function namesToProbe(
  rows: readonly SeenRow[],
  skip: ReadonlyMap<string, ReadonlySet<string>>,
  checkedAt: ReadonlyMap<string, string>,
  now: Date,
  max = MAX_NAMES_PER_RUN,
): ProbeName[] {
  const byKey = new Map<
    string,
    { name: string; key: string; users: Set<string>; websites: Set<string> }
  >();
  const fresh = now.getTime() - RECHECK_DAYS * 86_400_000;
  for (const r of rows) {
    if (!SUGGEST_SOURCES.has(r.source)) continue;
    const key = nameKey(r.company);
    if (!key || skip.get(r.user_id)?.has(key) || !slugsFor(key).length) continue;
    const at = Date.parse(checkedAt.get(key) ?? '');
    if (!Number.isNaN(at) && at > fresh) continue;
    let e = byKey.get(key);
    if (!e)
      byKey.set(
        key,
        (e = { name: r.company.trim().slice(0, 200), key, users: new Set(), websites: new Set() }),
      );
    e.users.add(r.user_id);
    const site = postingDomain(r.company, r.url);
    if (site && e.websites.size < MAX_WEBSITES) e.websites.add(site);
  }
  // Names more users saw first: one read helps more people.
  return [...byKey.values()]
    .sort((a, b) => b.users.size - a.users.size || a.key.localeCompare(b.key))
    .slice(0, max)
    .map((e) => ({ name: e.name, key: e.key, users: [...e.users], websites: [...e.websites] }));
}

const urlFor = (kind: ProbeKind, slug: string) =>
  kind === 'greenhouse' ? greenhouseListUrl(slug) : boardApiUrl({ kind, slug });

export interface ProbeAnswer {
  state: 'live' | 'none' | 'unknown';
  jobs?: number;
  /** What a live board says about its owner (boardIdentity.ts). */
  evidence?: BoardEvidence;
}

/** One guarded read (boardFetch.ts `guardedFetch`: fixed host, https, no redirect, the body
 *  streamed and capped at `max` bytes). 'none' on 404, 'unknown' on anything else that is not a
 *  200 with a job list. */
export async function probeOne(
  kind: ProbeKind,
  slug: string,
  f: Fetch,
  max = MAX_BYTES,
): Promise<ProbeAnswer> {
  if (!SLUG.test(slug)) return { state: 'unknown' };
  try {
    const r = await guardedFetch(kind, f, max)(urlFor(kind, slug));
    if (r.status === 404) return { state: 'none' };
    if (!r.ok) return { state: 'unknown' };
    const body: unknown = JSON.parse(await r.text());
    const jobs = boardJobs({ kind, slug }, body);
    if (!jobs) return { state: 'unknown' };
    return jobs.length
      ? { state: 'live', jobs: jobs.length, evidence: boardEvidence(body, jobs) }
      : { state: 'none' };
  } catch {
    return { state: 'unknown' };
  }
}

/** The name a Greenhouse board states (`/v1/boards/<slug>`, same fixed host), or '' when the read
 *  fails or names nothing. */
export async function greenhouseBoardName(
  slug: string,
  f: Fetch,
  max = MAX_BYTES,
): Promise<string> {
  if (!SLUG.test(slug)) return '';
  try {
    const r = await guardedFetch(
      'greenhouse',
      f,
      max,
    )(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}`);
    if (!r.ok) return '';
    const name = (JSON.parse(await r.text()) as { name?: unknown } | null)?.name;
    return typeof name === 'string' ? name.trim().slice(0, 200) : '';
  } catch {
    return '';
  }
}

/** Which of a name's live boards may be suggested (see the header's identity rule). `complete`:
 *  every read for the name answered, so a lone board really is the only one. */
export function confirmedHits<T extends { verdict: IdentityVerdict }>(
  name: string,
  hits: T[],
  complete = true,
): T[] {
  const matched = hits.filter((h) => h.verdict.identity === 'match');
  if (matched.length) return matched;
  if (complete && hits.length === 1 && hits[0].verdict.identity === 'unknown' && distinctName(name))
    return hits;
  return [];
}

export interface Suggestion {
  key: string;
  company: string;
  board: Board;
  jobs: number;
  users: string[];
}
export interface ProbeRun {
  suggestions: Suggestion[];
  /** Names answered (every read 'live' or 'none'): cached, not asked again for RECHECK_DAYS. A
   *  name with any unknown read is asked again next run, boards found or not. */
  checked: { key: string; found: boolean }[];
  reads: number;
}

/** Probe the names: each host one read at a time, `gap` ms apart, the hosts side by side. Stops
 *  starting reads past `deadline` (ms since epoch); names not fully read are not cached. */
export async function probeNames(
  names: readonly ProbeName[],
  o: {
    fetch: Fetch;
    sleep: (ms: number) => Promise<void>;
    now?: () => number;
    deadline?: number;
    gap?: number;
  },
): Promise<ProbeRun> {
  const now = o.now ?? Date.now;
  const gap = o.gap ?? GAP_MS;
  const results = new Map<string, ProbeAnswer>();
  let reads = 0;
  await Promise.all(
    PROBE_KINDS.map(async (kind) => {
      let first = true;
      for (const n of names)
        for (const slug of slugsFor(n.key)) {
          if (o.deadline !== undefined && now() > o.deadline) return;
          if (!first) await o.sleep(gap);
          first = false;
          reads++;
          const answer = await probeOne(kind, slug, o.fetch);
          // Greenhouse's list names no owner: its board endpoint does (same host, one more read).
          if (answer.state === 'live' && kind === 'greenhouse' && answer.evidence) {
            await o.sleep(gap);
            reads++;
            const stated = await greenhouseBoardName(slug, o.fetch);
            if (stated) answer.evidence = { ...answer.evidence, name: stated };
          }
          results.set(`${n.key}|${kind}|${slug}`, answer);
        }
    }),
  );
  const suggestions: Suggestion[] = [];
  const checked: ProbeRun['checked'] = [];
  for (const n of names) {
    let answered = true;
    const hits: { board: Board; jobs: number; verdict: IdentityVerdict }[] = [];
    for (const kind of PROBE_KINDS)
      for (const slug of slugsFor(n.key)) {
        const r = results.get(`${n.key}|${kind}|${slug}`);
        if (!r || r.state === 'unknown') answered = false;
        if (r?.state !== 'live') continue;
        const sites = n.websites?.length ? n.websites : [undefined];
        const verdicts = sites.map((website) =>
          identify({ name: n.name, website, weakWebsite: true }, r.evidence),
        );
        const verdict =
          verdicts.find((v) => v.identity === 'match') ??
          verdicts.find((v) => v.identity === 'mismatch') ??
          verdicts[0];
        hits.push({ board: { kind, slug }, jobs: r.jobs ?? 0, verdict });
      }
    const ok = confirmedHits(n.name, hits, answered);
    for (const h of ok)
      suggestions.push({
        key: n.key,
        company: n.name,
        board: h.board,
        jobs: h.jobs,
        users: n.users,
      });
    if (answered) checked.push({ key: n.key, found: ok.length > 0 });
  }
  return { suggestions, checked, reads };
}
