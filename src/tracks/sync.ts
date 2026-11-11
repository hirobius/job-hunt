// The sync's pure half (Muse Phase 2; Simplify 6/9, #387): read every followed board, the term
// feeds and the RSS feed, then score and dedupe what came back. The edge function
// (supabase/functions/sync-postings) adds the database; scripts/dry-run-sync.ts runs the same two
// steps with no database. Boards are read with the app's own parsers (src/feed/sources), so every
// board kind the browser reads, the server reads too. Ashby boards are read two at a time (their
// payloads are huge, ~0.9 MB on average measured 2026-11-02); the rest eight at a time, and the
// two groups run at the same time instead of one after the other (#448: measured on 152 boards,
// the old schedule spent 86.5 s on the pooled boards and then a further 39.2 s on serial Ashby).
// A Greenhouse board with stored rows is read the delta way: the light list (no descriptions),
// then downloads only for the jobs whose `updated_at` moved (#448).
import {
  boardJobs,
  fetchBoard,
  greenhouseJobUrl,
  greenhouseListUrl,
  parseGreenhouseJob,
} from '../feed/sources/ats.ts';
import { fetchHn } from '../feed/sources/hn.ts';
import { FetchError, obj, type FetchJson } from '../feed/sources/http.ts';
import { fetchJobicy } from '../feed/sources/jobicy.ts';
import { fetchRemotive } from '../feed/sources/remotive.ts';
import type { Posting } from '../feed/types.ts';
import { dedupe, fingerprint, type NormalizedPosting, type Verdict } from './score.ts';
import { scoreForTrack } from './scoreForTrack.ts';
import { SOURCE_ENABLED } from '../feed/sourceEnabled.ts';
import type { FeedContext } from './feeds/context.ts';
import { readDsJobsCatalog } from './feeds/dsjobsCatalog.ts';
import { SERVER_FEED_READERS, type ServerFeed } from './feeds/serverFeeds.ts';
import { fetchDesignSystemsJobsFeed, webOnly, type WatchedCompany } from './sources.ts';
import { guardedFetch, isGuarded } from './boardFetch.ts';
import type { TrackConfig } from './track-config.ts';

export type { WatchedCompany };

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/** The feeds searched by the profile's titles. */
export type TermFeed = 'hn' | 'remotive' | 'jobicy';
export const TERM_FEEDS: readonly TermFeed[] = ['hn', 'remotive', 'jobicy'];

/** Distinct titles each feeds run searches per term feed, across every user (#576 item 3). The
 *  feeds run twice a day: 06:23 and 14:23 (`keyed: false`). Remotive asks for at most ~4 requests a
 *  day (remotive.ts), so it is read on the morning run only: 2 terms, and a retry of each (retry.ts)
 *  still keeps the day at 4. The 14:23 run reads HN and Jobicy again, but not Remotive. */
export function termsPerRun(keyed: boolean): Record<TermFeed, number> {
  return { hn: 20, jobicy: 20, remotive: keyed ? 2 : 0 };
}

/** One read: a followed board (`company` set), a term feed (`term` set) or the RSS feed. A read
 *  that failed (`ok` false) never closes a posting. */
export interface ReadOutcome<C extends WatchedCompany = WatchedCompany> {
  company: C | null;
  /** `${ats}:${slug}` (Lever EU: `lever.eu:${slug}`), a term feed's id, or 'rss'. */
  board: string;
  term?: string;
  ok: boolean;
  /** It answered, but not with the whole list (designsystems.jobs read from its RSS alone, or part
   *  of its catalog): nothing may close as missed against it. */
  partial?: true;
  status?: number;
  error?: string;
  postings: NormalizedPosting[];
}

export const boardOf = (c: Pick<WatchedCompany, 'ats' | 'slug' | 'eu'>) =>
  `${c.ats === 'lever' && c.eu ? 'lever.eu' : c.ats}:${c.slug.toLowerCase()}`;

/** A shared board read as one watcher sees it: each board is read once, under its first
 *  watcher's row, so the postings carry that user's own `company` text. Every other watcher gets
 *  their own name back, never another user's (security review 2026-10-28). */
export function forWatcher<C extends WatchedCompany>(r: ReadOutcome, w: C): ReadOutcome<C> {
  return { ...r, company: w, postings: r.postings.map((p) => ({ ...p, company: w.company })) };
}

const PARALLEL = 8;
/** Ashby in flight at once: its payloads run ~0.9 MB, so this stays gentle on memory while
 *  halving the serial Ashby tail (#448). */
const ASHBY_PARALLEL = 2;

/** Browser sources the sync stores under 'manual' (Remote OK's browser read; the sync reads it
 *  itself, tracks/feeds/remoteok.ts). Every board kind, all 13 since #576, keeps its own source
 *  (migration 20261111100000 widens the postings check). */
const NOT_STORED = new Set<Posting['source']>(['remoteok']);

/** A live Posting (src/feed) as the scorer reads it. The source id is the Posting's own id
 *  (`greenhouse:stripe:123`), so the browser and the server name a posting the same way. */
export function normalize(p: Posting): NormalizedPosting {
  return {
    source: NOT_STORED.has(p.source) ? 'manual' : (p.source as NormalizedPosting['source']),
    sourceId: p.id,
    title: p.title,
    company: p.company,
    location: p.location || undefined,
    // false when the source says on-site or hybrid, so the scan rotation's remote-only rule
    // (rotation.ts) can tell "not remote" from "doesn't say".
    remote: p.mode === 'remote' ? true : p.mode ? false : undefined,
    url: p.url,
    descriptionText: p.text,
    postedAt: p.postedAt,
    sourceUpdatedAt: p.updatedAt,
  };
}

/** The feed parsers' fetch: JSON, or a FetchError carrying the status. */
const fetchJsonWith =
  (f: Fetch): FetchJson =>
  async (url) => {
    const r = await f(url);
    if (!r.ok) throw new FetchError(r.status, url);
    return r.json();
  };

/** A Greenhouse board read the delta way (#448): the light list first (titles, links and each
 *  job's `updated_at`, ~14× smaller than the `?content=true` list), then a single-job download
 *  only for jobs that are new or whose stamp moved — every other posting reuses the stored row,
 *  so the scorer reads exactly what a full read would give it. Stored rows the sync itself
 *  truncated or stripped never reach `known` (the loader filters them out), and a job with no
 *  stamp on either side is always refetched: reuse has to be provable, not likely. Throws on
 *  any failure; the caller falls back to the full read, so a delta hiccup costs time, never
 *  correctness. */
async function readGreenhouseDelta(
  slug: string,
  f: Fetch,
  known: ReadonlyMap<string, NormalizedPosting>,
): Promise<NormalizedPosting[]> {
  const fj = fetchJsonWith(f);
  const jobs = boardJobs({ kind: 'greenhouse', slug }, await fj(greenhouseListUrl(slug)));
  if (!jobs) throw new Error('greenhouse light list had no job list');
  const out: (NormalizedPosting | null)[] = new Array(jobs.length).fill(null);
  const toFetch: { i: number; id: string }[] = [];
  jobs.forEach((j, i) => {
    const meta = parseGreenhouseJob(j, slug);
    if (!meta) return; // the full read drops it the same way (no id or no URL)
    const prev = known.get(meta.id);
    // Instants, not strings: the board's offset format and the database's differ.
    const stamp = meta.updatedAt ? Date.parse(meta.updatedAt) : NaN;
    const prevStamp = prev?.sourceUpdatedAt ? Date.parse(prev.sourceUpdatedAt) : NaN;
    if (
      prev &&
      stamp === prevStamp &&
      prev.title === meta.title &&
      prev.url === meta.url &&
      prev.location === (meta.location || undefined)
    )
      out[i] = prev;
    else toFetch.push({ i, id: String(obj(j).id ?? '') });
  });
  // A re-posting wave (or a first read against stale rows) can mark most of a board changed:
  // past ~25 singles the one full list is cheaper in requests and time, so take the fallback.
  if (toFetch.length > 25)
    throw new Error(`greenhouse delta: ${toFetch.length} jobs changed at once`);
  // Gentler than the board pool: every board's singles hit the same Greenhouse host.
  for (let k = 0; k < toFetch.length; k += 4)
    await Promise.all(
      toFetch.slice(k, k + 4).map(async ({ i, id }) => {
        const one = parseGreenhouseJob(await fj(greenhouseJobUrl(slug, id)), slug);
        // The light list says this job exists, so an unparseable single is a failed read,
        // never a vanished job: throw, and the caller falls back to the full read.
        if (!one) throw new Error(`greenhouse job ${id} on ${slug} did not parse`);
        out[i] = normalize(one);
      }),
    );
  return out.filter((p): p is NormalizedPosting => !!p);
}

async function readOne<C extends WatchedCompany>(
  c: C,
  f: Fetch,
  known?: ReadonlyMap<string, NormalizedPosting>,
): Promise<ReadOutcome<C>> {
  const board = boardOf(c);
  try {
    let postings: NormalizedPosting[] | null = null;
    if (c.ats === 'greenhouse' && known?.size) {
      try {
        postings = await readGreenhouseDelta(c.slug, f, known);
      } catch {
        postings = null; // fall back to the full read below
      }
    }
    if (!postings) {
      // The five newer kinds go through the SSRF guard (fixed hosts, no redirects, a size cap).
      const read = isGuarded(c.ats) ? guardedFetch(c.ats, f) : f;
      const found = await fetchBoard(
        { kind: c.ats, slug: c.slug, ...(c.eu && { eu: true }) },
        fetchJsonWith(read),
      );
      postings = found.map(normalize);
    }
    const stamped = webOnly(postings).map((p) => ({ ...p, company: c.company }));
    return { company: c, board, ok: true, postings: stamped };
  } catch (e) {
    const status = e instanceof FetchError && e.status ? e.status : undefined;
    return { company: c, board, ok: false, status, error: String(e), postings: [] };
  }
}

const FEED_READERS: Record<TermFeed, (term: string, fj: FetchJson) => Promise<Posting[]>> = {
  hn: fetchHn,
  remotive: fetchRemotive,
  jobicy: fetchJobicy,
};

async function readFeed<C extends WatchedCompany>(
  feed: TermFeed,
  term: string,
  f: Fetch,
): Promise<ReadOutcome<C>> {
  try {
    const postings = webOnly((await FEED_READERS[feed](term, fetchJsonWith(f))).map(normalize));
    return { company: null, board: feed, term, ok: true, postings };
  } catch (e) {
    const status = e instanceof FetchError && e.status ? e.status : undefined;
    return { company: null, board: feed, term, ok: false, status, error: String(e), postings: [] };
  }
}

/** designsystems.jobs: its whole catalog (sitemap + job pages, `known` rows reused), the RSS
 *  filling in pages not read yet; the RSS alone when the catalog is off or its sitemap fails. */
async function readDsJobs<C extends WatchedCompany>(o: {
  fetch: Fetch;
  catalog: boolean;
  known?: ReadonlyMap<string, NormalizedPosting>;
  sleep?: (ms: number) => Promise<void>;
}): Promise<ReadOutcome<C>> {
  let status: number | undefined;
  let rss: NormalizedPosting[] = [];
  let rssError: string | undefined;
  try {
    rss = webOnly(await fetchDesignSystemsJobsFeed(o.fetch, (s) => (status = s)));
  } catch (e) {
    rssError = String(e);
  }
  let catalogError: string | undefined;
  if (o.catalog)
    try {
      const c = await readDsJobsCatalog({ fetch: o.fetch, known: o.known, rss, sleep: o.sleep });
      return {
        company: null,
        board: 'rss',
        ok: true,
        ...(!c.complete && { partial: true as const }),
        // The feed failing is still worth a log line when the catalog answered.
        ...(rssError || status !== undefined
          ? { error: `designsystems.jobs feed: ${rssError ?? `HTTP ${status}`}` }
          : {}),
        postings: webOnly(c.postings),
      };
    } catch (e) {
      catalogError = String(e);
    }
  const ok = status === undefined && !rssError;
  return {
    company: null,
    board: 'rss',
    ok,
    // The feed is the newest 20: the rest of the catalog is not in it, not gone.
    partial: true,
    status,
    error: [catalogError, rssError].filter(Boolean).join('; ') || undefined,
    postings: rss,
  };
}

async function readServerFeed<C extends WatchedCompany>(
  feed: ServerFeed,
  ctx: FeedContext,
): Promise<ReadOutcome<C>> {
  try {
    const postings = webOnly(await SERVER_FEED_READERS[feed](ctx));
    return { company: null, board: feed, ok: true, postings };
  } catch (e) {
    const status =
      typeof (e as { status?: unknown }).status === 'number'
        ? (e as { status: number }).status
        : undefined;
    return { company: null, board: feed, ok: false, status, error: String(e), postings: [] };
  }
}

export async function readAll<C extends WatchedCompany>(
  companies: C[],
  o: {
    fetch: Fetch;
    rss: boolean;
    terms?: Partial<Record<TermFeed, string[]>>;
    /** designsystems.jobs rows already stored, by page URL (the catalog reads only new pages). */
    known?: ReadonlyMap<string, NormalizedPosting>;
    /** Greenhouse rows already stored, by source id (`greenhouse:<slug>:<job id>`): a board
     *  with stored rows is read the delta way (light list, downloads only for changed jobs). */
    knownBoards?: ReadonlyMap<string, NormalizedPosting>;
    /** Read designsystems.jobs' whole catalog, not only its RSS (default: SOURCE_ENABLED). */
    catalog?: boolean;
    /** The sync's own searches to run, and what they get (keys, clock). */
    server?: { feeds: readonly ServerFeed[]; ctx: FeedContext };
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<ReadOutcome<C>[]> {
  const out: ReadOutcome<C>[] = [];
  // Stored rows grouped by board (`greenhouse:<slug>`), for the delta reads.
  const knownByBoard = new Map<string, Map<string, NormalizedPosting>>();
  for (const [id, p] of o.knownBoards ?? []) {
    const seg = id.split(':');
    if (seg.length < 3) continue;
    const b = `${seg[0]}:${seg[1]}`.toLowerCase();
    let m = knownByBoard.get(b);
    if (!m) knownByBoard.set(b, (m = new Map()));
    m.set(id, p);
  }
  // Pooled and Ashby at the same time (#448): the old schedule ran the pooled boards to
  // completion before starting Ashby, so a run paid both waits back to back.
  const inChunks = async (list: C[], size: number): Promise<ReadOutcome<C>[]> => {
    const part: ReadOutcome<C>[] = [];
    for (let i = 0; i < list.length; i += size)
      part.push(
        ...(await Promise.all(
          list.slice(i, i + size).map((c) => readOne(c, o.fetch, knownByBoard.get(boardOf(c)))),
        )),
      );
    return part;
  };
  const [pooled, ashby] = await Promise.all([
    inChunks(
      companies.filter((c) => c.ats !== 'ashby'),
      PARALLEL,
    ),
    inChunks(
      companies.filter((c) => c.ats === 'ashby'),
      ASHBY_PARALLEL,
    ),
  ]);
  out.push(...pooled, ...ashby);
  // Term feeds one request at a time: they are shared public APIs.
  for (const feed of TERM_FEEDS)
    for (const term of o.terms?.[feed] ?? []) out.push(await readFeed(feed, term, o.fetch));
  if (o.rss)
    out.push(
      await readDsJobs<C>({
        fetch: o.fetch,
        catalog: o.catalog ?? SOURCE_ENABLED.dsjobsCatalog,
        known: o.known,
        sleep: o.sleep,
      }),
    );
  // The sync's own searches, one at a time (each spaces its own calls).
  for (const feed of o.server?.feeds ?? []) out.push(await readServerFeed<C>(feed, o.server!.ctx));
  return out;
}

export interface ScoredPosting {
  posting: NormalizedPosting;
  board: string;
  score: number;
  verdict: Verdict;
  reasons: string[];
  matchedSignals: string[];
  fingerprint: string;
}

/** Dedupe by fingerprint (the ATS original over a copy, score.ts `dedupe`), then score each one
 *  (the fit rule after the scorer: no internships in the queue). */
export function scoreBatch(reads: ReadOutcome[], track: TrackConfig): ScoredPosting[] {
  const boardOfPosting = new Map<NormalizedPosting, string>();
  for (const r of reads) for (const p of r.postings) boardOfPosting.set(p, r.board);
  return dedupe([...boardOfPosting.keys()]).map((posting) => {
    const s = scoreForTrack(posting, track);
    return {
      posting,
      board: boardOfPosting.get(posting)!,
      ...s,
      fingerprint: fingerprint(posting),
    };
  });
}
