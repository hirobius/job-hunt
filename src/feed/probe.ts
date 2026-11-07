// Board probe (docs/specs/discovery-methods.md, methods 2 and 3): given a company name, find out
// which applicant-tracking systems host a public board for it, by asking each system's own keyless
// board API. Only a 200 with a parseable job list counts as a board; a 404 is "no board there";
// everything else (429, 5xx, timeout, CORS) is "unknown" and is never turned into "none".
//
// Politeness is part of the contract: 6 requests in flight overall, 2 per host, 150 ms between
// starts on one host, a host that answers 429 three times running is left alone for the session, and
// the caller can abort. Answers are cached in local storage (`rjb_probe`, not synced) so a second
// scan of the same list is nearly free. Tests inject `fetchJson`, never the network.
//
// A name is only slugs, and a common one ("Forward") is a slug on several boards that belong to
// other companies. So a board found from a name must show it is the company's (boardIdentity.ts:
// the company's website domain on the board, else the name the board states); one that doesn't is
// `unconfirmed`, listed but never watched. A pasted board URL is the user's word and is kept as is.
import {
  boardEvidence,
  confirmHits,
  identify,
  unconfirmedWhy,
  type BoardEvidence,
  type IdentityVerdict,
} from './boardIdentity';
import { browserKv, type KeyValue } from './fetchFeed';
import { hostKey } from './hostKey';
import {
  EMPTY_MEANS_NONE,
  boardApiUrl,
  boardJobs,
  parseBoardUrl,
  type Board,
  type BoardKind,
} from './sources/ats';
import { FetchError, prettySlug, type FetchJson } from './sources/http';

export const PROBE_KEY = 'rjb_probe';
export const PROBE_KINDS: BoardKind[] = [
  'greenhouse',
  'lever',
  'ashby',
  'workable',
  'recruitee',
  'smartrecruiters',
  'teamtailor',
  'personio',
  'bamboohr',
  'rippling',
  'gem',
  'pinpoint',
  'breezy',
];
/** Where a connection failure (status 0) is no board once another system answered: boards on a
 *  company subdomain fail DNS for a company without one. Never a single fixed API host (Rippling,
 *  Gem): there status 0 is CORS or a block, which says nothing about a board. */
const ZERO_IS_NONE: ReadonlySet<BoardKind> = new Set([
  'recruitee',
  'teamtailor',
  'personio',
  'bamboohr',
  'pinpoint',
  'breezy',
]);
export const MAX_IN_FLIGHT = 6;
export const MAX_PER_HOST = 2;
const HOST_GAP_MS = 150;
const HOST_STRIKES = 3;
const LIVE_TTL_MS = 30 * 86400e3;
const NONE_TTL_MS = 14 * 86400e3;
const CACHE_MAX = 5000;
/** Companies worked on at once; the limiter, not this, bounds the requests. */
const COMPANY_WORKERS = 6;

// ---- names to slugs ----

const HARD_SUFFIX =
  /^(inc|incorporated|llc|co|corp|corporation|ltd|limited|plc|gmbh|ag|sa|bv|oy|ab)$/;
const SOFT_SUFFIX = /^(labs|hq|technologies|technology|software|studio|studios)$/;
const SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
export const MAX_CANDIDATES = 4;

/** Up to 4 slugs a company's board might use, likeliest first: the name hyphenated and run
 *  together, then the same without a leading "The" or a trailing "Labs"/"Software"-like word.
 *  "Acme Labs, Inc." → `acme-labs`, `acmelabs`, `acme`; "The Browser Company" →
 *  `the-browser-company`, `thebrowsercompany`, `browser-company`, `browsercompany`. Accents fold
 *  ("Société" → `societe`) and "&" reads "and". */
export function slugCandidates(name: string): string[] {
  let words = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/&/g, ' and ')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  while (words.length > 1 && HARD_SUFFIX.test(words[words.length - 1])) words = words.slice(0, -1);
  if (!words.length) return [];
  let bare = words;
  if (bare.length > 1 && bare[0] === 'the') bare = bare.slice(1);
  if (bare.length > 1 && SOFT_SUFFIX.test(bare[bare.length - 1])) bare = bare.slice(0, -1);
  const out = [words.join('-'), words.join(''), bare.join('-'), bare.join('')];
  return [...new Set(out)].slice(0, MAX_CANDIDATES);
}

export interface CompanyTarget {
  name: string;
  /** Boards given outright (a pasted board URL): probed as they are. */
  boards: Board[];
  /** Slugs to try on every ATS when `boards` is empty. */
  candidates: string[];
}

/** One line of a pasted list: a board URL, a slug, or a company name. Null for blanks and junk. */
export function parseCompanyLine(line: string): CompanyTarget | null {
  const text = line.trim();
  if (!text) return null;
  const b = parseBoardUrl(text);
  if (b) return { name: prettySlug(b.slug), boards: [b], candidates: [] };
  if (/^https?:\/\//i.test(text) || text.includes('/')) return null;
  if (!/\s/.test(text) && SLUG.test(text))
    return { name: text, boards: [], candidates: [text.toLowerCase()] };
  const candidates = slugCandidates(text);
  return candidates.length ? { name: text, boards: [], candidates } : null;
}

// ---- one board ----

export type ProbeState = 'live' | 'none' | 'unknown';
export interface ProbeOutcome {
  result: ProbeState;
  /** Open roles, when live. */
  jobs?: number;
  /** HTTP status when the answer was an error (0 = never reached it). */
  status?: number;
  /** What a live board says about who it belongs to. */
  evidence?: BoardEvidence;
  /** The read timed out: the host is slow or down, which says nothing about a board. */
  timedOut?: true;
  /** Never asked: the host was stopped (3×429) or the run aborted. Says nothing about a board. */
  skipped?: true;
}

/** The probe asks for the light payload: a board's job bodies run megabytes and a scan reads hundreds. */
const probeUrl = (b: Board) => boardApiUrl(b).replace(/\?(content|details)=true$/, '');

export async function probeBoard(b: Board, fetchJson: FetchJson): Promise<ProbeOutcome> {
  let body: unknown;
  try {
    body = await fetchJson(probeUrl(b), { fresh: true });
  } catch (e) {
    if (e instanceof FetchError) {
      return e.status === 404
        ? { result: 'none', status: 404 }
        : { result: 'unknown', status: e.status, ...(e.isTimeout && { timedOut: true as const }) };
    }
    return { result: 'unknown', status: 0 };
  }
  const list = boardJobs(b, body);
  if (!list) return { result: 'unknown' };
  // SmartRecruiters answers an empty list for any name, board or not.
  if (!list.length && EMPTY_MEANS_NONE.has(b.kind)) return { result: 'none' };
  return { result: 'live', jobs: list.length, evidence: boardEvidence(body, list) };
}

// ---- politeness ----

/** The registrable domain, so every `*.recruitee.com` shares one budget (hostKey.ts). */
export { hostKey };

export type Ran<T> = { ran: true; value: T } | { ran: false };
export interface Limiter {
  run<T>(host: string, fn: () => Promise<T>, signal?: AbortSignal): Promise<Ran<T>>;
  /** Record a 429 from `host`. */
  strike(host: string): void;
  /** Record a non-429 answer: the run of 429s is broken. */
  ok(host: string): void;
  isStopped(host: string): boolean;
}

interface Pending {
  host: string;
  start: () => void;
  skip: () => void;
  signal?: AbortSignal;
}

export function createLimiter({
  maxInFlight = MAX_IN_FLIGHT,
  perHost = MAX_PER_HOST,
  gapMs = HOST_GAP_MS,
}: { maxInFlight?: number; perHost?: number; gapMs?: number } = {}): Limiter {
  const queue: Pending[] = [];
  const hostIn = new Map<string, number>();
  const lastStart = new Map<string, number>();
  const strikes = new Map<string, number>();
  let inFlight = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const isStopped = (h: string) => (strikes.get(h) ?? 0) >= HOST_STRIKES;

  function pump() {
    if (timer) clearTimeout(timer);
    timer = undefined;
    let wake: number | undefined;
    for (let i = 0; i < queue.length && inFlight < maxInFlight;) {
      const t = queue[i];
      if (t.signal?.aborted || isStopped(t.host)) {
        queue.splice(i, 1);
        t.skip();
        continue;
      }
      if ((hostIn.get(t.host) ?? 0) >= perHost) {
        i++;
        continue;
      }
      const wait = (lastStart.get(t.host) ?? -Infinity) + gapMs - Date.now();
      if (wait > 0) {
        wake = Math.min(wake ?? Infinity, wait);
        i++;
        continue;
      }
      queue.splice(i, 1);
      inFlight++;
      hostIn.set(t.host, (hostIn.get(t.host) ?? 0) + 1);
      lastStart.set(t.host, Date.now());
      t.start();
    }
    if (wake !== undefined) timer = setTimeout(pump, Math.max(1, wake));
  }

  return {
    run(host, fn, signal) {
      return new Promise((resolve, reject) => {
        queue.push({
          host,
          signal,
          skip: () => resolve({ ran: false }),
          start: () => {
            fn()
              .then(
                (value) => resolve({ ran: true, value }),
                (e) => reject(e),
              )
              .finally(() => {
                inFlight--;
                hostIn.set(host, (hostIn.get(host) ?? 1) - 1);
                pump();
              });
          },
        });
        pump();
      });
    },
    strike: (h) => void strikes.set(h, (strikes.get(h) ?? 0) + 1),
    ok: (h) => void strikes.set(h, 0),
    isStopped,
  };
}

// ---- cache ----

interface CacheEntry {
  r: 'live' | 'none';
  at: number;
  n?: number;
  /** A live board's evidence, empty lists left out; a live entry without it predates the identity
   *  check and is asked again. */
  e?: Partial<BoardEvidence>;
}
type Cache = Record<string, CacheEntry>;

/** Evidence as cached: empty lists left out (thousands of entries share one storage key). */
const compactEvidence = (e: BoardEvidence): Partial<BoardEvidence> => ({
  ...(e.name && { name: e.name }),
  ...(e.domains.length && { domains: e.domains }),
  ...(e.textDomains.length && { textDomains: e.textDomains }),
});

const cacheKey = (b: Board) => `${b.kind}${b.eu ? '-eu' : ''}:${b.slug.toLowerCase()}`;

function readCache(kv: KeyValue): Cache {
  try {
    const v: unknown = JSON.parse(kv.get(PROBE_KEY) ?? '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Cache) : {};
  } catch {
    return {};
  }
}

function writeCache(kv: KeyValue, cache: Cache) {
  const keys = Object.keys(cache);
  if (keys.length > CACHE_MAX) {
    keys.sort((a, b) => cache[a].at - cache[b].at);
    for (const k of keys.slice(0, keys.length - CACHE_MAX)) delete cache[k];
  }
  kv.set(PROBE_KEY, JSON.stringify(cache));
}

function fromCache(cache: Cache, b: Board, now: number): ProbeOutcome | null {
  const e = cache[cacheKey(b)];
  if (!e || (e.r !== 'live' && e.r !== 'none') || typeof e.at !== 'number') return null;
  const ttl = e.r === 'live' ? LIVE_TTL_MS : NONE_TTL_MS;
  if (now - e.at >= ttl) return null;
  if (e.r === 'none') return { result: 'none' };
  const ev = e.e && typeof e.e === 'object' ? e.e : null;
  if (!ev) return null;
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
  return {
    result: 'live',
    jobs: e.n,
    evidence: {
      ...(typeof ev.name === 'string' && { name: ev.name }),
      domains: list(ev.domains),
      textDomains: list(ev.textDomains),
    },
  };
}

// ---- companies ----

export interface BoardHit {
  board: Board;
  /** Open roles at the time of the check (zero is "no openings now", still a board). */
  jobs?: number;
}
export interface UnconfirmedHit extends BoardHit {
  /** Why it isn't taken as the company's, in one sentence. */
  why: string;
}
export interface CompanyProbe {
  /** The line the user gave. */
  input: string;
  name: string;
  /** found: at least one live board that is the company's. unconfirmed: live boards, none shown to
   *  be the company's. missed: every board checked answered 404. unknown: none of these. */
  state: 'found' | 'unconfirmed' | 'missed' | 'unknown';
  hits: BoardHit[];
  /** Live boards for the name that don't show they are this company's: never watched. */
  unconfirmed: UnconfirmedHit[];
  /** Boards that could not be answered (rate-limited, offline, blocked). */
  unknown: Board[];
}

export interface ProbeOptions {
  fetchJson: FetchJson;
  signal?: AbortSignal;
  kv?: KeyValue;
  now?: () => number;
  limiter?: Limiter;
  /** Each company's website, by its line lower-cased: the identity check's best evidence. */
  websites?: ReadonlyMap<string, string>;
  /** The websites are weak (a design system's site, a GitHub organisation's blog): they can confirm
   *  a board but never rule one out (boardIdentity.ts `identify`). */
  weakWebsites?: boolean;
  /** The board kinds to ask for a slug (every kind by default). The auto-scan asks only the kind
   *  the board set already knows for it, else the three most common (2026-11-07). */
  kindsFor?: (slug: string) => readonly BoardKind[];
}

const boardsFor = (slug: string, kinds: readonly BoardKind[] = PROBE_KINDS): Board[] =>
  kinds.map((kind) => ({ kind, slug }));

/** Probe each company and yield its result as soon as it is known (not in input order). Stops
 *  asking when `signal` aborts or the consumer stops iterating. */
export async function* probeCompanies(
  inputs: string[],
  opts: ProbeOptions,
): AsyncGenerator<CompanyProbe> {
  const { fetchJson, signal } = opts;
  const kv = opts.kv ?? browserKv();
  const now = opts.now ?? Date.now;
  const limiter = opts.limiter ?? createLimiter();
  const cache = readCache(kv);
  let dirty = false;
  let stopped = false;
  const halt = () => stopped || !!signal?.aborted;

  async function check(b: Board): Promise<ProbeOutcome> {
    const hit = fromCache(cache, b, now());
    if (hit) return hit;
    const host = hostKey(probeUrl(b));
    const ran = await limiter.run(host, () => probeBoard(b, fetchJson), signal);
    if (!ran.ran) return { result: 'unknown', status: 0, skipped: true };
    const out = ran.value;
    if (out.status === 429) limiter.strike(host);
    else limiter.ok(host);
    if (out.result !== 'unknown') {
      cache[cacheKey(b)] = {
        r: out.result,
        at: now(),
        ...(out.jobs !== undefined && { n: out.jobs }),
        ...(out.evidence && { e: compactEvidence(out.evidence) }),
      };
      dirty = true;
    }
    return out;
  }

  async function probeCompany(input: string): Promise<CompanyProbe | null> {
    const target = parseCompanyLine(input);
    if (!target) return null;
    const given = target.boards.length > 0;
    const groups = given
      ? [target.boards]
      : target.candidates
          .map((slug) => boardsFor(slug, opts.kindsFor?.(slug)))
          .filter((g) => g.length > 0);
    const company = {
      name: target.name,
      website: opts.websites?.get(input.trim().toLowerCase()),
      weakWebsite: opts.weakWebsites,
    };
    type Checked = BoardHit & { verdict: IdentityVerdict; others: number };
    const confirmed: Checked[] = [];
    const unconfirmed: Checked[] = [];
    const unknown: Board[] = [];
    let allNone = true;
    for (const group of groups) {
      if (halt()) return null;
      const outs = await Promise.all(group.map((b) => check(b)));
      // A Recruitee, Teamtailor or Personio board is a subdomain, so a company without one fails
      // DNS (status 0), not 404. When another ATS in the same round answered, the network is up:
      // read that as none.
      const reached = outs.some((o) => o.result !== 'unknown');
      group.forEach((b, i) => {
        if (
          reached &&
          ZERO_IS_NONE.has(b.kind) &&
          outs[i].result === 'unknown' &&
          outs[i].status === 0 &&
          !outs[i].timedOut &&
          !outs[i].skipped
        )
          outs[i] = { result: 'none', status: 0 };
      });
      const live: Checked[] = [];
      group.forEach((b, i) => {
        const o = outs[i];
        if (o.result === 'live')
          live.push({ board: b, jobs: o.jobs, verdict: identify(company, o.evidence), others: 0 });
        else if (o.result === 'unknown') unknown.push(b);
      });
      // One slug at a time: boards found under another slug say nothing about this one's.
      live.forEach((h) => (h.others = live.length - 1));
      const round = given ? { confirmed: live, unconfirmed: [] } : confirmHits(live);
      confirmed.push(...round.confirmed);
      unconfirmed.push(...round.unconfirmed);
      // Boards that only might be the company's don't stop the search: a later slug may confirm.
      if (confirmed.length) break;
      if (outs.some((o) => o.result !== 'none')) allNone = false;
    }
    if (halt()) return null;
    const hits = confirmed.map(({ board, jobs }) => ({ board, jobs }));
    return {
      input,
      name: target.name,
      state: hits.length
        ? 'found'
        : unconfirmed.length
          ? 'unconfirmed'
          : allNone && !unknown.length
            ? 'missed'
            : 'unknown',
      hits,
      unconfirmed: unconfirmed.map(({ board, jobs, verdict, others }) => ({
        board,
        jobs,
        why: unconfirmedWhy(verdict, others),
      })),
      unknown,
    };
  }

  const ready: CompanyProbe[] = [];
  let wake: (() => void) | null = null;
  let finished = false;
  let next = 0;
  const worker = async () => {
    while (!halt() && next < inputs.length) {
      const r = await probeCompany(inputs[next++]);
      if (r && !halt()) {
        ready.push(r);
        wake?.();
      }
    }
  };
  const all = Promise.all(
    Array.from({ length: Math.min(COMPANY_WORKERS, inputs.length) }, worker),
  ).then(() => {
    finished = true;
    wake?.();
  });

  try {
    for (;;) {
      if (ready.length) {
        yield ready.shift()!;
        continue;
      }
      if (finished || halt()) break;
      await new Promise<void>((r) => (wake = r));
      wake = null;
    }
  } finally {
    stopped = true;
    if (dirty) writeCache(kv, cache);
    void all;
  }
}
