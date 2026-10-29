// The scan rotation (#src-bulk): the server reads the whole bulk board set (src/feed/boardSet.ts,
// thousands of public company boards) a slice at a time, so every board is read about every 6 to
// 12 hours, and keeps only remote design-system roles. This module is the rotation's pure half:
// which boards the next invocation reads (`pickBatch`), how it reads them (`runBatch`: a time box,
// a per-host limit), and what the run leaves behind (`advance`: the cursor, the cycle,
// host backoffs, the boards owed a read, dead boards). The edge function
// (supabase/functions/sync-postings, `{ rotate: true }`) adds the database; `npm run sync:dry-run
// -- --rotate` plans a batch from the snapshot. No clock, network or storage of its own: the
// caller passes them in. Explicit `.ts` specifiers so Deno and Node load it.
//
// Rules (rotation.test.ts pins each one):
// - Order: by `orderKey` (a hash of the board key, then the key), so the hosts are interleaved (a
//   batch is never all Greenhouse) and a board keeps its place whatever else the snapshot adds or
//   drops. The cursor is the last order value passed; the next run starts after it. Past the last
//   one the walk wraps to the start and the cycle counter goes up (`cycleStartedAt` = that run's
//   start). A run never wraps twice: it stops at the end of the list.
// - Size: a run reads at most `maxBoards` boards and stops adding once the boards' last known
//   open roles (`jobs`, `unknownJobs` when unknown) reach `jobsBudget` (always at least one): big
//   boards cost CPU to parse and score, and the worker has ~2 s of it.
// - Time box: any read whose host has room starts (the list order breaks ties); once `timeBoxMs`
//   has passed since the run began no new read starts. The cursor moves only over boards actually
//   processed: it stops before the first board, in walk order, whose read never started (boards
//   after it that were read are read again next run: harmless, an upsert).
// - Hosts: at most `hostConcurrency` reads in flight per host (its registrable domain,
//   feed/hostKey.ts: every Greenhouse board is one host; Ashby 1, `hostLimits`),
//   `globalConcurrency` in all.
// - 429: the host backs off (15 min, doubling per strike in a row, at most 24 h; an answer from
//   the host clears it). A board whose host is backed off is not read and does not block the walk:
//   the cursor passes it and it goes on the carry list, which the next runs read first once its
//   host is free. A board that got a 429 (or was held back after one) is carried too. The carry
//   list never holds more than `maxCarry`: past it a board is passed as `overflow` (counted and
//   reported, read on the next cycle). A run passes at most `maxWalk` boards, so a long backoff of
//   every host can't skip the whole cycle in a few runs.
// - 404: the board goes on the dead list, retried after 1, then 3, then 7 days (7 from then on),
//   and is disabled after `disableAfter` 404s in a row (delete its row to try it again). A dead
//   board that answers is back at once. The edge function closes its stored postings.
// - Any other failure (5xx, timeout, a bad body) closes nothing and is not a 404: the board waits
//   for the next cycle (a dead board's retry date moves on, its count stays).
import { setBoardKey, type SetBoard } from '../feed/boardSet.ts';
import { hostKey } from '../feed/hostKey.ts';
import { remoteVerdict } from '../feed/mode.ts';
import { boardApiUrl } from '../feed/sources/ats.ts';
import type { ScoredPosting, WatchedCompany } from './sync.ts';

const HOUR = 3600e3;
const DAY = 24 * HOUR;

/** The rotation's knobs. README's run-time numbers come from `rotationMath` over these. */
export const ROTATION = {
  /** Boards read per invocation, at most. */
  maxBoards: 25,
  /** Open roles (the snapshot's `jobs`) per invocation: stop adding boards at this. */
  jobsBudget: 1500,
  /** A board whose `jobs` is unknown counts as this many. */
  unknownJobs: 50,
  /** No new read starts after this much wall time. */
  timeBoxMs: 40_000,
  /** Each read's own cap (the edge function's fetch timeout). */
  fetchTimeoutMs: 15_000,
  /** pg_cron calls the rotation once every this many minutes. */
  cronMinutes: 1,
  /** After this much wall time a run starts no new write: users not yet written wait (the cursor
   *  stays) and, once all are written, missed-marking stops (it is only ever late, never doubled). */
  writeDeadlineMs: 110_000,
  /** A run holds the cursor this long; a run that finds it held does nothing. The free plan's
   *  150 s wall limit: no run outlives it there, and work past `writeDeadlineMs` is a few small
   *  writes (the cursor, the dead list, the log). */
  leaseMs: 150_000,
  /** Who the scan is for (every user's plan) is cached in a warm worker this long. */
  plansTtlMs: 5 * 60e3,
  hostConcurrency: 3,
  /** Hosts with their own limit: Ashby payloads are huge (sync.ts reads them one at a time). */
  hostLimits: { 'ashbyhq.com': 1 } as Readonly<Record<string, number>>,
  globalConcurrency: 6,
  backoffBaseMs: 15 * 60e3,
  backoffMaxMs: 24 * HOUR,
  /** Days until a 404 board is asked again, by 404s in a row (the last repeats). */
  deadRetryDays: [1, 3, 7] as readonly number[],
  /** 404s in a row that disable a board. */
  disableAfter: 4,
  /** Boards owed a read (host backed off) carried at most; past it a board waits a cycle. */
  maxCarry: 500,
  /** Boards a run's walk passes at most (reads, skips and deferrals together). */
  maxWalk: 100,
  /** A read's wall time assumed by `rotationMath`'s batch estimate (a slow board). */
  estReadMs: 2000,
  /** The goal: every board read at least this often. */
  targetCycleHours: 12,
};
export type RotationOptions = typeof ROTATION;

export interface HostBackoff {
  /** ISO time until which the host is not asked. */
  until: string;
  /** 429s in a row. */
  strikes: number;
}

export interface RotationState {
  /** The last order value (`orderKey`) passed; '' before the first. */
  cursor: string;
  cycle: number;
  /** ISO start of the current cycle. */
  cycleStartedAt: string;
  /** Host → its backoff. */
  backoff: Record<string, HostBackoff>;
  /** Boards the cursor passed while their host was backed off, read first once it is free. */
  carry: string[];
}

export interface DeadBoard {
  key: string;
  lastStatus: number;
  /** 404s in a row. */
  fails: number;
  /** ISO time of the next try. */
  retryAt: string;
  disabled: boolean;
  /** ISO time of the last read. */
  lastChecked: string;
}

export const emptyRotation = (nowMs: number): RotationState => ({
  cursor: '',
  cycle: 0,
  cycleStartedAt: new Date(nowMs).toISOString(),
  backoff: {},
  carry: [],
});

const isoOr = (v: unknown, fallback: string) =>
  typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : fallback;

/** A stored state, checked (the database row's fields, or anything else: the empty state). */
export function sanitizeRotation(raw: unknown, nowMs: number): RotationState {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const empty = emptyRotation(nowMs);
  const backoff: Record<string, HostBackoff> = {};
  if (o.backoff && typeof o.backoff === 'object')
    for (const [host, v] of Object.entries(o.backoff as Record<string, unknown>)) {
      const b = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
      const until = isoOr(b.until, '');
      if (until)
        backoff[host] = {
          until,
          strikes: typeof b.strikes === 'number' && b.strikes > 0 ? Math.floor(b.strikes) : 1,
        };
    }
  return {
    // A cursor of another shape (the first build walked by key) starts the walk over.
    cursor: typeof o.cursor === 'string' && ORDER.test(o.cursor) ? o.cursor : '',
    cycle: typeof o.cycle === 'number' && o.cycle >= 0 ? Math.floor(o.cycle) : 0,
    cycleStartedAt: isoOr(o.cycleStartedAt, empty.cycleStartedAt),
    backoff,
    carry: Array.isArray(o.carry)
      ? [...new Set(o.carry.filter((k): k is string => typeof k === 'string'))]
      : [],
  };
}

/** The host a board's read goes to (feed/hostKey.ts). */
export const hostOf = (b: Pick<SetBoard, 'kind' | 'slug' | 'eu'>) =>
  hostKey(boardApiUrl({ kind: b.kind, slug: b.slug, ...(b.eu && { eu: true }) }));

const ORDER = /^[0-9a-f]{8}\|./;

/** FNV-1a, 32 bits, as 8 hex digits. */
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** A board's place in the walk: its key's hash, then the key (ties). Depends on the key alone. */
export const orderKey = (key: string) => `${fnv1a(key)}|${key}`;

export interface Ordered {
  board: SetBoard;
  key: string;
  order: string;
}

const orderCache = new WeakMap<readonly SetBoard[], Ordered[]>();

/** The set in walk order (cached per array: the edge function parses the set once). */
export function rotationOrder(boards: readonly SetBoard[]): Ordered[] {
  let list = orderCache.get(boards);
  if (!list) {
    list = boards
      .map((board) => {
        const key = setBoardKey(board);
        return { board, key, order: orderKey(key) };
      })
      .sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0));
    orderCache.set(boards, list);
  }
  return list;
}

/** A set board as the sync's reader takes it. */
export const toWatched = (b: SetBoard): WatchedCompany => ({
  company: b.company,
  ats: b.kind,
  slug: b.slug,
  ...(b.eu && { eu: true as const }),
});

export type StepAction =
  /** Read this run. */
  | 'read'
  /** On the dead list and not due: passed. */
  | 'dead'
  /** Disabled after repeated 404s: passed. */
  | 'disabled'
  /** Its host is backed off: passed and carried. */
  | 'defer'
  /** Its host is backed off and the carry list is full: passed, read next cycle. */
  | 'overflow'
  /** Already on the carry list (its host still backed off, or read from it this run): passed. */
  | 'carried';

export interface Step {
  key: string;
  board: SetBoard;
  host: string;
  action: StepAction;
  /** Read from the carry list, not the walk. */
  fromCarry?: true;
}

export interface BatchPick {
  /** The cursor the walk started after ('' when it wrapped). */
  startCursor: string;
  cycle: number;
  cycleStartedAt: string;
  wrapped: boolean;
  /** Carried reads first, then the walk in order (`rotationOrder`). */
  steps: Step[];
}

const backedOff = (s: RotationState, host: string, nowMs: number) => {
  const b = s.backoff[host];
  return !!b && Date.parse(b.until) > nowMs;
};

/** The next run's boards: the carry list's boards whose host is free, then the walk from the
 *  cursor, until `maxBoards` reads, `jobsBudget` roles or `maxWalk` boards passed. */
export function pickBatch(
  boards: readonly SetBoard[],
  state: RotationState,
  dead: ReadonlyMap<string, DeadBoard>,
  nowMs: number,
  o: RotationOptions = ROTATION,
): BatchPick {
  const ordered = rotationOrder(boards);
  const byKey = new Map(ordered.map((x) => [x.key, x.board]));
  const steps: Step[] = [];
  let reads = 0;
  let jobs = 0;
  const full = () => reads >= o.maxBoards || jobs >= o.jobsBudget;
  const take = (b: SetBoard) => {
    reads++;
    jobs += b.jobs ?? o.unknownJobs;
  };

  const carry = state.carry.filter((k) => byKey.has(k));
  const carried = new Set(carry);
  for (const key of carry) {
    if (full()) break;
    const board = byKey.get(key)!;
    const host = hostOf(board);
    if (backedOff(state, host, nowMs)) continue;
    steps.push({ key, board, host, action: 'read', fromCarry: true });
    take(board);
  }

  let start = ordered.findIndex((x) => x.order > state.cursor);
  let { cycle, cycleStartedAt } = state;
  let startCursor = state.cursor;
  const wrapped = start === -1 && ordered.length > 0;
  if (wrapped) {
    start = 0;
    startCursor = '';
    cycle++;
    cycleStartedAt = new Date(nowMs).toISOString();
  }
  let room = o.maxCarry - carry.length;
  let walked = 0;
  for (let i = Math.max(start, 0); i < ordered.length && !full() && walked < o.maxWalk; i++) {
    const { key, board } = ordered[i];
    const host = hostOf(board);
    const d = dead.get(key);
    let action: StepAction = 'read';
    if (carried.has(key)) action = 'carried';
    else if (d?.disabled) action = 'disabled';
    else if (d && Date.parse(d.retryAt) > nowMs) action = 'dead';
    else if (backedOff(state, host, nowMs)) action = room-- > 0 ? 'defer' : 'overflow';
    steps.push({ key, board, host, action });
    walked++;
    if (action === 'read') take(board);
  }
  return { startCursor, cycle, cycleStartedAt, wrapped, steps };
}

/** What one read came to. `deferred`: not started, its host got a 429 earlier in this run.
 *  `unstarted`: the time box ran out first. */
export type ReadResult = 'ok' | 'gone' | 'failed' | 'throttled' | 'deferred' | 'unstarted';

export const classify = (r: { ok: boolean; status?: number }): ReadResult =>
  r.ok ? 'ok' : r.status === 404 ? 'gone' : r.status === 429 ? 'throttled' : 'failed';

export interface Ran<T> {
  key: string;
  host: string;
  result: ReadResult;
  status?: number;
  value?: T;
}

/** Read the items: whenever a slot is free, the first item (in list order) whose host has room
 *  starts, so one slow host never holds the others up. None starts once the time box is spent, and
 *  none on a host that answered 429 in this run (`deferred`). Items never started stay
 *  `unstarted`; `advance` moves the cursor only up to the first of them. `read` must not throw (a
 *  throw counts as a failure). */
export async function runBatch<T extends { ok: boolean; status?: number }>(
  items: readonly { key: string; host: string }[],
  read: (item: { key: string; host: string }) => Promise<T>,
  o: { now: () => number; startedAt: number } & Pick<
    RotationOptions,
    'timeBoxMs' | 'hostConcurrency' | 'globalConcurrency'
  > & { hostLimits?: Readonly<Record<string, number>> },
): Promise<Ran<T>[]> {
  const out: Ran<T>[] = items.map((i) => ({ key: i.key, host: i.host, result: 'unstarted' }));
  const inFlight = new Map<string, number>();
  const running = new Set<Promise<void>>();
  const throttled = new Set<string>();
  let total = 0;
  let pending = items.map((_, i) => i);
  const timeUp = () => o.now() - o.startedAt >= o.timeBoxMs;
  const hasRoom = (host: string) =>
    (inFlight.get(host) ?? 0) < (o.hostLimits?.[host] ?? o.hostConcurrency);
  const start = (i: number) => {
    const { host } = items[i];
    inFlight.set(host, (inFlight.get(host) ?? 0) + 1);
    total++;
    const slot = out[i];
    // Started: never 'unstarted' again, whatever the read comes to.
    slot.result = 'failed';
    const p: Promise<void> = read(items[i])
      .then(
        (value) => {
          slot.result = classify(value);
          slot.status = value.status;
          slot.value = value;
        },
        () => undefined,
      )
      .then(() => {
        if (slot.result === 'throttled') throttled.add(host);
        inFlight.set(host, inFlight.get(host)! - 1);
        total--;
        running.delete(p);
      });
    running.add(p);
  };
  while (pending.length && !timeUp()) {
    pending = pending.filter((i) => {
      if (!throttled.has(items[i].host)) return true;
      out[i].result = 'deferred';
      return false;
    });
    const next =
      total < o.globalConcurrency ? pending.find((i) => hasRoom(items[i].host)) : undefined;
    if (next !== undefined) {
      pending = pending.filter((i) => i !== next);
      start(next);
    } else if (running.size) await Promise.race(running);
    else break;
  }
  await Promise.all(running);
  return out;
}

export interface Advance {
  state: RotationState;
  /** Dead-list rows to write. */
  deadUpsert: DeadBoard[];
  /** Dead-list rows to delete (the board answered). */
  deadRemove: string[];
  /** Walk boards the cursor passed this run. */
  passed: number;
  /** Boards passed with no read and no room on the carry list: read next cycle. */
  overflow: string[];
  /** The cursor reached the last board: the next run starts a new cycle. */
  cycleDone: boolean;
}

const retryDays = (fails: number, o: RotationOptions) =>
  o.deadRetryDays[Math.min(Math.max(fails, 1), o.deadRetryDays.length) - 1];

/** The state after a run: the cursor over the boards processed, the carry list, host backoffs and
 *  the dead list. `results` are `runBatch`'s, for the pick's read steps. */
export function advance(
  boards: readonly SetBoard[],
  state: RotationState,
  pick: BatchPick,
  results: readonly Ran<unknown>[],
  dead: ReadonlyMap<string, DeadBoard>,
  nowMs: number,
  o: RotationOptions = ROTATION,
): Advance {
  const now = new Date(nowMs).toISOString();
  const ordered = rotationOrder(boards);
  const inSet = new Set(ordered.map((x) => x.key));
  const byKey = new Map(results.map((r) => [r.key, r]));

  // The cursor: over the walk, up to the first read that never started.
  const walk = pick.steps.filter((s) => !s.fromCarry);
  let cursor = pick.startCursor;
  let passed = 0;
  const carryAdd: string[] = [];
  const overflow: string[] = [];
  for (const s of walk) {
    const r = s.action === 'read' ? byKey.get(s.key) : undefined;
    if (s.action === 'read' && (!r || r.result === 'unstarted')) break;
    cursor = orderKey(s.key);
    passed++;
    if (s.action === 'overflow') overflow.push(s.key);
    if (s.action === 'defer' || r?.result === 'throttled' || r?.result === 'deferred')
      carryAdd.push(s.key);
  }

  // The carry list: drop what was read (any answer but a 429), keep the rest, add the new ones.
  const settled = new Set(
    pick.steps
      .filter((s) => s.fromCarry)
      .map((s) => byKey.get(s.key))
      .filter((r): r is Ran<unknown> => !!r && ['ok', 'gone', 'failed'].includes(r.result))
      .map((r) => r.key),
  );
  // Never past `maxCarry`: the boards that don't fit wait for the next cycle (reported).
  const all = [
    ...new Set([...state.carry.filter((k) => inSet.has(k) && !settled.has(k)), ...carryAdd]),
  ];
  const carry = all.slice(0, o.maxCarry);
  overflow.push(...all.slice(o.maxCarry));

  // Host backoffs: a 429 doubles the wait, an answer clears it. One strike per host per run.
  const backoff = { ...state.backoff };
  const struck = new Set<string>();
  for (const r of results) {
    if (r.result === 'throttled' && !struck.has(r.host)) {
      struck.add(r.host);
      const strikes = (state.backoff[r.host]?.strikes ?? 0) + 1;
      const wait = Math.min(o.backoffMaxMs, o.backoffBaseMs * 2 ** (strikes - 1));
      backoff[r.host] = { until: new Date(nowMs + wait).toISOString(), strikes };
    }
  }
  for (const r of results)
    if ((r.result === 'ok' || r.result === 'gone') && !struck.has(r.host)) delete backoff[r.host];

  // The dead list.
  const deadUpsert: DeadBoard[] = [];
  const deadRemove: string[] = [];
  for (const r of results) {
    const d = dead.get(r.key);
    if (r.result === 'ok' && d) deadRemove.push(r.key);
    else if (r.result === 'gone') {
      const fails = (d?.fails ?? 0) + 1;
      deadUpsert.push({
        key: r.key,
        lastStatus: 404,
        fails,
        retryAt: new Date(nowMs + retryDays(fails, o) * DAY).toISOString(),
        disabled: fails >= o.disableAfter,
        lastChecked: now,
      });
    } else if (r.result === 'failed' && d)
      deadUpsert.push({
        ...d,
        lastStatus: r.status ?? 0,
        retryAt: new Date(nowMs + retryDays(d.fails, o) * DAY).toISOString(),
        lastChecked: now,
      });
  }

  const last = ordered.length ? ordered[ordered.length - 1].order : '';
  return {
    state: { cursor, cycle: pick.cycle, cycleStartedAt: pick.cycleStartedAt, backoff, carry },
    deadUpsert,
    deadRemove,
    passed,
    overflow,
    cycleDone: !!last && cursor === last,
  };
}

/** A scored posting the scan stores: not rejected by the profile's scorer (queue or review) and
 *  remote (mode.ts `remoteVerdict`: remote, or no mode and no city named). */
export function keepForScan(s: Pick<ScoredPosting, 'verdict' | 'posting'>): boolean {
  if (s.verdict === 'reject') return false;
  const { remote, location } = s.posting;
  const mode = remote === true ? 'remote' : remote === false ? 'onsite' : undefined;
  return remoteVerdict(mode, location ?? '') !== 'drop';
}

type MathBoard = Pick<SetBoard, 'jobs'> & Partial<Pick<SetBoard, 'kind' | 'slug' | 'eu'>>;

/** The batches one cycle takes over these boards (in the order given), packed the way `pickBatch`
 *  packs them (no dead boards, no backoff). */
export function cycleBatches<B extends MathBoard>(
  boards: readonly B[],
  o: RotationOptions = ROTATION,
): B[][] {
  const out: B[][] = [];
  for (let i = 0; i < boards.length;) {
    const batch: B[] = [];
    let jobs = 0;
    while (i < boards.length && batch.length < o.maxBoards && jobs < o.jobsBudget) {
      jobs += boards[i].jobs ?? o.unknownJobs;
      batch.push(boards[i++]);
    }
    out.push(batch);
  }
  return out;
}

export const runsPerCycle = (boards: readonly MathBoard[], o: RotationOptions = ROTATION) =>
  cycleBatches(boards, o).length;

/** A batch's read time at `estReadMs` a read: the slowest host's rounds (its boards over its
 *  limit), or the batch over the overall limit, whichever is longer. Boards without a kind count
 *  as one host each. */
export function batchReadMs(batch: readonly MathBoard[], o: RotationOptions = ROTATION): number {
  const perHost = new Map<string, number>();
  batch.forEach((b, i) => {
    const h = b.kind && b.slug ? hostOf(b as SetBoard) : `#${i}`;
    perHost.set(h, (perHost.get(h) ?? 0) + 1);
  });
  let rounds = Math.ceil(batch.length / o.globalConcurrency);
  for (const [h, n] of perHost)
    rounds = Math.max(rounds, Math.ceil(n / (o.hostLimits[h] ?? o.hostConcurrency)));
  return rounds * o.estReadMs;
}

export interface RotationMath {
  boards: number;
  runsPerCycle: number;
  boardsPerRun: number;
  runsPerHour: number;
  hoursPerCycle: number;
  invocationsPerMonth: number;
  /** The slowest batch's estimated read time (`batchReadMs`). */
  estBatchReadMs: number;
  /** Every batch's reads fit in the time box (at `estReadMs` a read). */
  fitsTimeBox: boolean;
  /** Writes stop before the lease ends, and the lease is inside the free plan's 150 s. */
  fitsWall: boolean;
  meetsTarget: boolean;
}

/** The rotation's run-time numbers for a board list in walk order (README's table). */
export function rotationMath(
  boards: readonly MathBoard[],
  o: RotationOptions = ROTATION,
): RotationMath {
  const batches = cycleBatches(boards, o);
  const runs = batches.length;
  const runsPerHour = 60 / o.cronMinutes;
  const hoursPerCycle = runs / runsPerHour;
  const estBatchReadMs = Math.max(0, ...batches.map((b) => batchReadMs(b, o)));
  return {
    boards: boards.length,
    runsPerCycle: runs,
    boardsPerRun: runs ? boards.length / runs : 0,
    runsPerHour,
    hoursPerCycle,
    invocationsPerMonth: runsPerHour * 24 * 30,
    estBatchReadMs,
    fitsTimeBox: estBatchReadMs <= o.timeBoxMs,
    fitsWall:
      o.timeBoxMs + o.fetchTimeoutMs < o.writeDeadlineMs &&
      o.writeDeadlineMs < o.leaseMs &&
      o.leaseMs <= 150_000,
    meetsTarget: hoursPerCycle <= o.targetCycleHours,
  };
}

/** The host mix `sampleBoards` assumes (a guess at the bulk set: mostly Greenhouse). */
export const SAMPLE_MIX: readonly [SetBoard['kind'], number][] = [
  ['greenhouse', 0.6],
  ['lever', 0.25],
  ['ashby', 0.15],
];

/** `n` boards of `jobs` open roles each, in `SAMPLE_MIX`, in walk order: for the README's 5,000
 *  and 10,000 rows. */
export function sampleBoards(n: number, jobs: number): SetBoard[] {
  const boards: SetBoard[] = [];
  let i = 0;
  for (const [kind, share] of SAMPLE_MIX)
    for (let k = 0; k < Math.round(n * share) && i < n; k++, i++)
      boards.push({ kind, slug: `s${i}`, company: `s${i}`, jobs, lastChecked: '', evidence: '' });
  return rotationOrder(boards).map((x) => x.board);
}
