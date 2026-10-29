// The scan rotation (#src-bulk): the server reads the whole bulk board set (src/feed/boardSet.ts,
// thousands of public company boards) a slice at a time, so every board is read about every 6 to
// 12 hours, and keeps only remote design-system roles. This module is the rotation's pure half:
// which boards the next invocation reads (`pickBatch`), how it reads them (`runBatch`: a time box,
// a per-host limit, in order), and what the run leaves behind (`advance`: the cursor, the cycle,
// host backoffs, the boards owed a read, dead boards). The edge function
// (supabase/functions/sync-postings, `{ rotate: true }`) adds the database; `npm run sync:dry-run
// -- --rotate` plans a batch from the snapshot. No clock, network or storage of its own: the
// caller passes them in. Explicit `.ts` specifiers so Deno and Node load it.
//
// Rules (rotation.test.ts pins each one):
// - Order: boards by key (`setBoardKey`), the order boardSet.ts sorts them in. The cursor is the
//   last key the rotation has passed; the next run starts after it. Past the last key the walk
//   wraps to the start and the cycle counter goes up (`cycleStartedAt` = that run's start). A run
//   never wraps twice: it stops at the end of the list.
// - Size: a run reads at most `maxBoards` boards and stops adding once the boards' last known
//   open roles (`jobs`, `unknownJobs` when unknown) reach `jobsBudget` (always at least one): big
//   boards cost CPU to parse and score, and the worker has ~2 s of it.
// - Time box: reads start in order; once `timeBoxMs` has passed since the run began no new read
//   starts. The cursor moves only over boards actually processed: it stops before the first board
//   whose read never started.
// - Hosts: at most `hostConcurrency` reads in flight per host (its registrable domain, probe.ts
//   `hostKey`'s rule: every Greenhouse board is one host; Ashby 1, `hostLimits`),
//   `globalConcurrency` in all.
// - 429: the host backs off (15 min, doubling per strike in a row, at most 24 h; an answer from
//   the host clears it). A board whose host is backed off is never read and never skipped
//   silently: the cursor passes it and it goes on the carry list, which the next runs read first
//   once its host is free. When the carry list is full (`maxCarry`) the walk stops at the board
//   instead, so the cursor waits there. A board that got the 429 is carried too.
// - 404: the board goes on the dead list, retried after 1, then 3, then 7 days (7 from then on),
//   and is disabled after `disableAfter` 404s in a row (delete its row to try it again). A dead
//   board that answers is back at once. The edge function closes its stored postings.
// - Any other failure (5xx, timeout, a bad body) closes nothing and is not a 404: the board waits
//   for the next cycle (a dead board's retry date moves on, its count stays).
import { setBoardKey, type SetBoard } from '../feed/boardSet.ts';
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
  /** A run holds the cursor this long; a run that finds it held does nothing. */
  leaseMs: 90_000,
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
  /** Boards owed a read (host backed off) carried at most; past it the cursor waits. */
  maxCarry: 500,
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
  /** The last board key passed; '' before the first. */
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
    cursor: typeof o.cursor === 'string' ? o.cursor : '',
    cycle: typeof o.cycle === 'number' && o.cycle >= 0 ? Math.floor(o.cycle) : 0,
    cycleStartedAt: isoOr(o.cycleStartedAt, empty.cycleStartedAt),
    backoff,
    carry: Array.isArray(o.carry)
      ? [...new Set(o.carry.filter((k): k is string => typeof k === 'string'))]
      : [],
  };
}

/** A registrable domain, probe.ts `hostKey`'s rule (the last two labels). */
export const hostKey = (hostname: string) => hostname.split('.').slice(-2).join('.');

/** The host a board's read goes to. */
export const hostOf = (b: Pick<SetBoard, 'kind' | 'slug' | 'eu'>) =>
  hostKey(new URL(boardApiUrl({ kind: b.kind, slug: b.slug, ...(b.eu && { eu: true }) })).hostname);

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

export interface Pick {
  /** The cursor the walk started after ('' when it wrapped). */
  startCursor: string;
  cycle: number;
  cycleStartedAt: string;
  wrapped: boolean;
  /** Carried reads first, then the walk in key order. */
  steps: Step[];
}

const backedOff = (s: RotationState, host: string, nowMs: number) => {
  const b = s.backoff[host];
  return !!b && Date.parse(b.until) > nowMs;
};

/** The next run's boards: the carry list's boards whose host is free, then the walk from the
 *  cursor, until `maxBoards` reads or `jobsBudget` roles. `boards` is the set in key order. */
export function pickBatch(
  boards: readonly SetBoard[],
  state: RotationState,
  dead: ReadonlyMap<string, DeadBoard>,
  nowMs: number,
  o: RotationOptions = ROTATION,
): Pick {
  const keys = boards.map(setBoardKey);
  const byKey = new Map(boards.map((b, i) => [keys[i], b]));
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

  let start = keys.findIndex((k) => k > state.cursor);
  let { cycle, cycleStartedAt } = state;
  let startCursor = state.cursor;
  const wrapped = start === -1 && keys.length > 0;
  if (wrapped) {
    start = 0;
    startCursor = '';
    cycle++;
    cycleStartedAt = new Date(nowMs).toISOString();
  }
  let room = o.maxCarry - carry.length;
  for (let i = Math.max(start, 0); i < keys.length && !full(); i++) {
    const key = keys[i];
    const board = byKey.get(key)!;
    const host = hostOf(board);
    const d = dead.get(key);
    let action: StepAction = 'read';
    if (carried.has(key)) action = 'carried';
    else if (d?.disabled) action = 'disabled';
    else if (d && Date.parse(d.retryAt) > nowMs) action = 'dead';
    else if (backedOff(state, host, nowMs)) {
      // The carry list is full: wait here rather than pass a board that would go unread.
      if (room <= 0) break;
      room--;
      action = 'defer';
    }
    steps.push({ key, board, host, action });
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

/** Read the items in order: each waits for room on its host (and overall), none starts once the
 *  time box is spent, and none starts on a host that answered 429 in this run. So the started reads
 *  are always a prefix of the list (bar the deferred ones), which is what lets the cursor move only
 *  over boards processed. `read` must not throw (a throw counts as a failure). */
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
  const timeUp = () => o.now() - o.startedAt >= o.timeBoxMs;
  for (let i = 0; i < items.length; i++) {
    const { host } = items[i];
    const limit = o.hostLimits?.[host] ?? o.hostConcurrency;
    while (running.size && ((inFlight.get(host) ?? 0) >= limit || total >= o.globalConcurrency))
      await Promise.race(running);
    if (timeUp()) break;
    if (throttled.has(host)) {
      out[i].result = 'deferred';
      continue;
    }
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
  pick: Pick,
  results: readonly Ran<unknown>[],
  dead: ReadonlyMap<string, DeadBoard>,
  nowMs: number,
  o: RotationOptions = ROTATION,
): Advance {
  const now = new Date(nowMs).toISOString();
  const inSet = new Set(boards.map(setBoardKey));
  const byKey = new Map(results.map((r) => [r.key, r]));

  // The cursor: over the walk, up to the first read that never started.
  const walk = pick.steps.filter((s) => !s.fromCarry);
  let cursor = pick.startCursor;
  let passed = 0;
  const carryAdd: string[] = [];
  for (const s of walk) {
    const r = s.action === 'read' ? byKey.get(s.key) : undefined;
    if (s.action === 'read' && (!r || r.result === 'unstarted')) break;
    cursor = s.key;
    passed++;
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
  const carry = [
    ...new Set([...state.carry.filter((k) => inSet.has(k) && !settled.has(k)), ...carryAdd]),
  ];

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

  const last = boards.length ? setBoardKey(boards[boards.length - 1]) : '';
  return {
    state: { cursor, cycle: pick.cycle, cycleStartedAt: pick.cycleStartedAt, backoff, carry },
    deadUpsert,
    deadRemove,
    passed,
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

/** Runs one cycle takes over these boards, packed the way `pickBatch` packs them (no dead boards,
 *  no backoff). */
export function runsPerCycle(
  boards: readonly Pick<SetBoard, 'jobs'>[],
  o: RotationOptions = ROTATION,
): number {
  let runs = 0;
  for (let i = 0; i < boards.length; runs++) {
    let reads = 0;
    let jobs = 0;
    while (i < boards.length && reads < o.maxBoards && jobs < o.jobsBudget) {
      jobs += boards[i].jobs ?? o.unknownJobs;
      reads++;
      i++;
    }
  }
  return runs;
}

export interface RotationMath {
  boards: number;
  runsPerCycle: number;
  boardsPerRun: number;
  runsPerHour: number;
  hoursPerCycle: number;
  invocationsPerMonth: number;
  /** The longest a run can take: the time box plus one read's timeout. */
  worstWallMs: number;
  /** Inside the cron gap (no overlap) and the free plan's 150 s wall clock. */
  fitsWall: boolean;
  meetsTarget: boolean;
}

/** The rotation's run-time numbers for a board list (README's table comes from these). */
export function rotationMath(
  boards: readonly Pick<SetBoard, 'jobs'>[],
  o: RotationOptions = ROTATION,
): RotationMath {
  const runs = runsPerCycle(boards, o);
  const runsPerHour = 60 / o.cronMinutes;
  const hoursPerCycle = runs / runsPerHour;
  const worstWallMs = o.timeBoxMs + o.fetchTimeoutMs;
  return {
    boards: boards.length,
    runsPerCycle: runs,
    boardsPerRun: runs ? boards.length / runs : 0,
    runsPerHour,
    hoursPerCycle,
    invocationsPerMonth: runsPerHour * 24 * 30,
    worstWallMs,
    fitsWall: worstWallMs < Math.min(o.cronMinutes * 60e3, 150_000),
    meetsTarget: hoursPerCycle <= o.targetCycleHours,
  };
}

/** `n` boards of `jobs` open roles each: for the README's 5,000 and 10,000 rows. */
export const sampleBoards = (n: number, jobs: number) =>
  Array.from({ length: n }, () => ({ jobs }));
