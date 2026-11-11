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
//     systems), and it is still only "possible": a common name can be someone else's board.
// Pure apart from the fetch and sleep it is given: the edge function and the tests share it.
import {
  boardJobs,
  greenhouseListUrl,
  boardApiUrl,
  type Board,
  type BoardKind,
} from '../feed/sources/ats.ts';

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

const HOST: Record<ProbeKind, string> = {
  greenhouse: 'boards-api.greenhouse.io',
  lever: 'api.lever.co',
  ashby: 'api.ashbyhq.com',
};
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
}

/** The names to probe this run, and who saw each one. Skips names a user already follows (by
 *  name), names checked within RECHECK_DAYS and names with no usable slug. */
export function namesToProbe(
  rows: readonly SeenRow[],
  followedNames: ReadonlySet<string>,
  checkedAt: ReadonlyMap<string, string>,
  now: Date,
  max = MAX_NAMES_PER_RUN,
): { name: string; key: string; users: string[] }[] {
  const byKey = new Map<string, { name: string; key: string; users: Set<string> }>();
  const fresh = now.getTime() - RECHECK_DAYS * 86_400_000;
  for (const r of rows) {
    if (!SUGGEST_SOURCES.has(r.source)) continue;
    const key = nameKey(r.company);
    if (!key || followedNames.has(key) || !slugsFor(key).length) continue;
    const at = Date.parse(checkedAt.get(key) ?? '');
    if (!Number.isNaN(at) && at > fresh) continue;
    let e = byKey.get(key);
    if (!e) byKey.set(key, (e = { name: r.company.trim().slice(0, 200), key, users: new Set() }));
    e.users.add(r.user_id);
  }
  // Names more users saw first: one read helps more people.
  return [...byKey.values()]
    .sort((a, b) => b.users.size - a.users.size || a.key.localeCompare(b.key))
    .slice(0, max)
    .map((e) => ({ ...e, users: [...e.users] }));
}

const urlFor = (kind: ProbeKind, slug: string) =>
  kind === 'greenhouse' ? greenhouseListUrl(slug) : boardApiUrl({ kind, slug });

/** One guarded read: fixed host, no redirect, capped body. 'none' on 404, 'unknown' on anything
 *  else that is not a 200 with a job list. */
export async function probeOne(
  kind: ProbeKind,
  slug: string,
  f: Fetch,
): Promise<{ state: 'live' | 'none' | 'unknown'; jobs?: number }> {
  if (!SLUG.test(slug)) return { state: 'unknown' };
  const url = urlFor(kind, slug);
  if (new URL(url).hostname !== HOST[kind]) return { state: 'unknown' };
  try {
    const r = await f(url, { redirect: 'error' });
    if (r.redirected || (r.url && new URL(r.url).hostname !== HOST[kind]))
      return { state: 'unknown' };
    if (r.status === 404) return { state: 'none' };
    if (!r.ok) return { state: 'unknown' };
    const len = Number(r.headers.get('content-length'));
    if (Number.isFinite(len) && len > MAX_BYTES) return { state: 'unknown' };
    const text = await r.text();
    if (text.length > MAX_BYTES) return { state: 'unknown' };
    const jobs = boardJobs({ kind, slug }, JSON.parse(text));
    if (!jobs) return { state: 'unknown' };
    return jobs.length ? { state: 'live', jobs: jobs.length } : { state: 'none' };
  } catch {
    return { state: 'unknown' };
  }
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
  /** Names answered (every read 'live' or 'none'): cached, not asked again for RECHECK_DAYS. */
  checked: { key: string; found: boolean }[];
  reads: number;
}

/** Probe the names: each host one read at a time, `gap` ms apart, the hosts side by side. Stops
 *  starting reads past `deadline` (ms since epoch); names not fully read are not cached. */
export async function probeNames(
  names: readonly { name: string; key: string; users: string[] }[],
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
  const results = new Map<string, { state: string; jobs?: number }>();
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
          results.set(`${n.key}|${kind}|${slug}`, await probeOne(kind, slug, o.fetch));
        }
    }),
  );
  const suggestions: Suggestion[] = [];
  const checked: ProbeRun['checked'] = [];
  for (const n of names) {
    let answered = true;
    let found = false;
    for (const kind of PROBE_KINDS)
      for (const slug of slugsFor(n.key)) {
        const r = results.get(`${n.key}|${kind}|${slug}`);
        if (!r || r.state === 'unknown') answered = false;
        if (r?.state === 'live') {
          found = true;
          suggestions.push({
            key: n.key,
            company: n.name,
            board: { kind, slug },
            jobs: r.jobs ?? 0,
            users: n.users,
          });
        }
      }
    if (answered || found) checked.push({ key: n.key, found });
  }
  return { suggestions, checked, reads };
}
