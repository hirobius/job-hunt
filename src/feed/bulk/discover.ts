// Bulk board discovery, step 2 (#src-bulk): ask each candidate board (harvest.ts) whether it is live
// and build the committed snapshot, src/feed/data/boards.json (boardSet.ts reads it). The probe's
// own rules decide (probe.ts `probeBoard`): live is a 200 with a job list, 404 is no board, anything
// else is unknown and never counted either way. Politeness is the probe's limiter (6 in flight,
// 2 per host, 150 ms between starts on one host, a host that answers 429 three times running is
// left alone for the rest of the run); unknowns get one more pass once the first is done.
//
// Every candidate came from a link to the board itself, so the URL is the evidence the board
// exists; the identity check (boardIdentity.ts) only decides which company name it carries: a
// source's name that the board's own stated name or domain contradicts gives way to the board's.
import { identify, type BoardEvidence } from '../boardIdentity.ts';
import type { BoardSet, BoardSetSource, SetBoard } from '../boardSet.ts';
import { hostKey, probeBoard, type Limiter, type ProbeOutcome } from '../probe.ts';
import { boardApiUrl } from '../sources/ats.ts';
import { prettySlug, type FetchJson } from '../sources/http.ts';
import { candidateKey, type Candidate } from './harvest.ts';

/** A probe answer as the run's cache keeps it (live or none only; unknown is asked again). */
export interface CachedProbe {
  r: 'live' | 'none';
  /** YYYY-MM-DD it was asked. */
  at: string;
  n?: number;
  e?: BoardEvidence;
}

export interface ValidateOptions {
  fetchJson: FetchJson;
  limiter: Limiter;
  now: () => Date;
  /** Answers from an earlier run, by candidate key; written as the run goes. */
  cache?: Map<string, CachedProbe>;
  /** Cached answers younger than this many days are used as they are. */
  cacheDays?: number;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

export interface Validated {
  boards: SetBoard[];
  counts: {
    candidates: number;
    live: number;
    none: number;
    unknown: number;
    /** Live boards with at least one open role. */
    hiring: number;
    /** Live boards per kind. */
    [kind: string]: number;
  };
  /** Unknown answers per host, so a run says which hosts it could not reach. */
  unknownByHost: Record<string, number>;
}

/** Candidates worked on at once; the limiter, not this, bounds the requests per host. */
export const WORKERS = 24;

const day = (d: Date) => d.toISOString().slice(0, 10);

/** The board as the snapshot lists it. */
export function toSetBoard(c: Candidate, o: ProbeOutcome, checked: string): SetBoard {
  const ev = o.evidence;
  let company = c.company;
  let how = 'url';
  if (company && ev) {
    const v = identify({ name: company, website: c.website }, ev);
    if (v.identity === 'match') how = 'url+identity';
    else if (v.identity === 'mismatch' && ev.name) company = ev.name;
  }
  if (!company) company = ev?.name ?? prettySlug(c.board.slug);
  const website = (c.website ? hostOnly(c.website) : '') || ev?.domains[0] || '';
  return {
    kind: c.board.kind,
    slug: c.board.slug,
    ...(c.board.eu && { eu: true as const }),
    company: company.slice(0, 100),
    ...(website && { website }),
    ...(typeof o.jobs === 'number' && { jobs: o.jobs }),
    lastChecked: checked,
    evidence: `${how}:${c.sources.join('+')}`,
  };
}

function hostOnly(site: string): string {
  try {
    return new URL(/^https?:\/\//i.test(site) ? site : `https://${site}`).hostname
      .toLowerCase()
      .replace(/^www\./, '');
  } catch {
    return '';
  }
}

const fresh = (c: CachedProbe | undefined, now: Date, days: number) =>
  !!c && now.getTime() - Date.parse(`${c.at}T00:00:00Z`) < days * 86400e3;

/** Probe every candidate (cached answers first) and keep the live boards. */
export async function validateCandidates(
  candidates: Candidate[],
  opts: ValidateOptions,
): Promise<Validated> {
  const { fetchJson, limiter, now, cache = new Map(), cacheDays = 7, onProgress, signal } = opts;
  const today = day(now());
  const answers = new Map<string, ProbeOutcome>();
  let done = 0;

  async function ask(c: Candidate) {
    const key = candidateKey(c.board);
    const hit = cache.get(key);
    if (fresh(hit, now(), cacheDays)) {
      answers.set(
        key,
        hit!.r === 'live' ? { result: 'live', jobs: hit!.n, evidence: hit!.e } : { result: 'none' },
      );
      return;
    }
    const host = hostKey(boardApiUrl(c.board));
    const ran = await limiter.run(host, () => probeBoard(c.board, fetchJson), signal);
    const o: ProbeOutcome = ran.ran ? ran.value : { result: 'unknown', skipped: true };
    if (o.status === 429) limiter.strike(host);
    else if (ran.ran) limiter.ok(host);
    answers.set(key, o);
    if (o.result === 'live')
      cache.set(key, { r: 'live', at: today, n: o.jobs, ...(o.evidence && { e: o.evidence }) });
    else if (o.result === 'none') cache.set(key, { r: 'none', at: today });
  }

  const total = candidates.length;
  // A pool of workers feeds the limiter, so its queue stays short with thousands of candidates.
  const pass = async (list: Candidate[]) => {
    let next = 0;
    const worker = async () => {
      while (next < list.length && !signal?.aborted) {
        await ask(list[next++]);
        done++;
        onProgress?.(Math.min(done, total), total);
      }
    };
    await Promise.all(Array.from({ length: Math.min(WORKERS, list.length) }, worker));
  };
  await pass(candidates);
  // One more pass for the unknowns (a timeout or 5xx the first time), none skipped by a stop.
  const again = candidates.filter((c) => {
    const o = answers.get(candidateKey(c.board));
    return o?.result === 'unknown' && !o.skipped && !signal?.aborted;
  });
  done = total - again.length;
  if (again.length) await pass(again);

  const boards: SetBoard[] = [];
  const counts: Validated['counts'] = {
    candidates: total,
    live: 0,
    none: 0,
    unknown: 0,
    hiring: 0,
  };
  const unknownByHost: Record<string, number> = {};
  for (const c of candidates) {
    const o = answers.get(candidateKey(c.board)) ?? { result: 'unknown' as const };
    if (o.result === 'live') {
      counts.live++;
      counts[c.board.kind] = (counts[c.board.kind] ?? 0) + 1;
      if ((o.jobs ?? 0) > 0) counts.hiring++;
      const cached = cache.get(candidateKey(c.board));
      boards.push(toSetBoard(c, o, cached?.at ?? today));
    } else if (o.result === 'none') counts.none++;
    else {
      counts.unknown++;
      const host = hostKey(boardApiUrl(c.board));
      unknownByHost[host] = (unknownByHost[host] ?? 0) + 1;
    }
  }
  return { boards, counts, unknownByHost };
}

export const BOARD_SET_NOTE =
  'Public company job boards found in public sources (each credited in `sources`) and confirmed live by the probe (a 200 with a job list). The server scan rotation reads every board here; Today counts them. Regenerate with `npm run boards:discover`.';

/** The snapshot as boards.json holds it. */
export function buildBoardSet(v: Validated, sources: BoardSetSource[], generated: Date): BoardSet {
  return {
    generated: day(generated),
    note: BOARD_SET_NOTE,
    sources,
    counts: { ...v.counts, confirmed: v.boards.length },
    boards: [...v.boards].sort((a, b) => (candidateKey(a) < candidateKey(b) ? -1 : 1)),
  };
}
