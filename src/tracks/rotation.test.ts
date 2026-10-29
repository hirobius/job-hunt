import { describe, expect, it } from 'vitest';
import boardsJson from '../feed/data/boards.json';
import { parseBoardSet, setBoardKey, type SetBoard } from '../feed/boardSet.ts';
import {
  advance,
  classify,
  emptyRotation,
  hostOf,
  keepForScan,
  pickBatch,
  ROTATION,
  rotationMath,
  runBatch,
  runsPerCycle,
  sampleBoards,
  sanitizeRotation,
  type DeadBoard,
  type Ran,
  type RotationOptions,
  type ReadResult,
  type RotationState,
} from './rotation.ts';

const T0 = Date.parse('2026-10-29T12:00:00Z');
const MIN = 60e3;
const DAY = 86400e3;

const board = (kind: SetBoard['kind'], slug: string, jobs?: number): SetBoard => ({
  kind,
  slug,
  company: slug,
  lastChecked: '2026-10-29',
  evidence: 'test',
  ...(jobs !== undefined && { jobs }),
});
/** Sorted the way the snapshot is. */
const set = (...boards: SetBoard[]) => parseBoardSet({ boards }).boards;
const gh = (n: number, jobs = 10) =>
  Array.from({ length: n }, (_, i) => board('greenhouse', `g${String(i).padStart(2, '0')}`, jobs));
const opts = (o: Partial<RotationOptions> = {}): RotationOptions => ({ ...ROTATION, ...o });
const state = (s: Partial<RotationState> = {}): RotationState => ({ ...emptyRotation(T0), ...s });
const noDead = new Map<string, DeadBoard>();
const reads = (p: ReturnType<typeof pickBatch>) =>
  p.steps.filter((s) => s.action === 'read').map((s) => s.key);
/** Every read of a pick came back with `result`, unless `by` says otherwise. */
const ran = (
  p: ReturnType<typeof pickBatch>,
  by: Record<string, Ran<unknown>['result']> = {},
  status: Record<string, number> = {},
): Ran<unknown>[] =>
  p.steps
    .filter((s) => s.action === 'read')
    .map((s) => ({
      key: s.key,
      host: s.host,
      result: by[s.key] ?? 'ok',
      ...(status[s.key] !== undefined && { status: status[s.key] }),
    }));

describe('hostOf: the registrable domain of the board read', () => {
  it.each([
    [board('greenhouse', 'stripe'), 'greenhouse.io'],
    [board('lever', 'acme'), 'lever.co'],
    [{ ...board('lever', 'acme'), eu: true as const }, 'lever.co'],
    [board('ashby', 'ramp'), 'ashbyhq.com'],
    [board('recruitee', 'acme'), 'recruitee.com'],
    [board('teamtailor', 'acme'), 'teamtailor.com'],
  ])('%o → %s', (b, host) => expect(hostOf(b)).toBe(host));
});

describe('classify', () => {
  it.each([
    [{ ok: true }, 'ok'],
    [{ ok: false, status: 404 }, 'gone'],
    [{ ok: false, status: 429 }, 'throttled'],
    [{ ok: false, status: 503 }, 'failed'],
    [{ ok: false }, 'failed'],
  ] as const)('%o → %s', (r, want) => expect(classify(r)).toBe(want));
});

describe('pickBatch: the cursor, the batch size, wrapping', () => {
  const boards = gh(10);
  const keys = boards.map(setBoardKey);
  it.each([
    ['from the start', '', 4, keys.slice(0, 4), false, 0],
    ['after the cursor', keys[3], 4, keys.slice(4, 8), false, 0],
    ['stops at the end of the list, no wrap in the same run', keys[7], 4, keys.slice(8), false, 0],
    ['wraps past the last key and bumps the cycle', keys[9], 4, keys.slice(0, 4), true, 1],
  ])('%s', (_, cursor, maxBoards, want, wrapped, cycle) => {
    const p = pickBatch(boards, state({ cursor }), noDead, T0, opts({ maxBoards }));
    expect(reads(p)).toEqual(want);
    expect(p.wrapped).toBe(wrapped);
    expect(p.cycle).toBe(cycle);
  });

  it('a wrap starts the cycle clock', () => {
    const p = pickBatch(boards, state({ cursor: keys[9], cycle: 3 }), noDead, T0 + DAY);
    expect(p).toMatchObject({
      cycle: 4,
      startCursor: '',
      cycleStartedAt: new Date(T0 + DAY).toISOString(),
    });
  });

  it.each([
    ['big boards fill the roles budget first', [600, 600, 600, 10], 1000, 2],
    ['one board over the budget is still read', [5000, 10], 1000, 1],
    ['unknown roles count as unknownJobs', [undefined, undefined, undefined], 100, 2],
  ])('%s', (_, jobs, jobsBudget, n) => {
    const bs = set(...jobs.map((j, i) => board('greenhouse', `b${i}`, j)));
    const p = pickBatch(bs, state(), noDead, T0, opts({ jobsBudget, unknownJobs: 50 }));
    expect(reads(p)).toHaveLength(n);
  });

  it('an empty set reads nothing and never wraps', () => {
    const p = pickBatch([], state({ cursor: 'x' }), noDead, T0);
    expect(p.steps).toEqual([]);
    expect(p.wrapped).toBe(false);
  });
});

describe('pickBatch: dead and disabled boards are passed, a due one is read', () => {
  const boards = gh(4);
  const keys = boards.map(setBoardKey);
  const dead = (fails: number, retryAt: number, disabled = false): DeadBoard => ({
    key: '',
    lastStatus: 404,
    fails,
    retryAt: new Date(retryAt).toISOString(),
    disabled,
    lastChecked: new Date(T0 - DAY).toISOString(),
  });
  it.each([
    ['not due', dead(1, T0 + DAY), 'dead'],
    ['due', dead(1, T0 - 1), 'read'],
    ['disabled', dead(4, T0 - 1, true), 'disabled'],
  ])('%s → %s', (_, d, action) => {
    const p = pickBatch(boards, state(), new Map([[keys[1], d]]), T0, opts({ maxBoards: 3 }));
    expect(p.steps[1].action).toBe(action);
    // A passed board doesn't take a read's place.
    expect(reads(p)).toHaveLength(3);
  });
});

describe('pickBatch: a backed-off host is carried, never skipped silently', () => {
  const boards = set(
    board('ashby', 'a1'),
    board('greenhouse', 'g1'),
    board('greenhouse', 'g2'),
    board('lever', 'l1'),
  );
  const ghOff = { 'greenhouse.io': { until: new Date(T0 + MIN).toISOString(), strikes: 1 } };

  it('passes the host’s boards as defer and reads the rest', () => {
    const p = pickBatch(boards, state({ backoff: ghOff }), noDead, T0);
    expect(p.steps.map((s) => `${s.key}:${s.action}`)).toEqual([
      'ashby:a1:read',
      'greenhouse:g1:defer',
      'greenhouse:g2:defer',
      'lever:l1:read',
    ]);
  });

  it('an expired backoff reads as usual', () => {
    const p = pickBatch(boards, state({ backoff: ghOff }), noDead, T0 + 2 * MIN);
    expect(reads(p)).toHaveLength(4);
  });

  it('a full carry list stops the walk at the board instead', () => {
    const p = pickBatch(boards, state({ backoff: ghOff }), noDead, T0, opts({ maxCarry: 1 }));
    expect(p.steps.map((s) => s.action)).toEqual(['read', 'defer']);
    const next = advance(boards, state({ backoff: ghOff }), p, ran(p), noDead, T0);
    expect(next.state.cursor).toBe('greenhouse:g1');
    expect(next.state.carry).toEqual(['greenhouse:g1']);
  });

  it('carried boards are read first once their host is free, and passed by the walk', () => {
    const s = state({ cursor: '', carry: ['greenhouse:g2', 'gone:board'] });
    const p = pickBatch(boards, s, noDead, T0);
    expect(p.steps.map((x) => `${x.key}:${x.action}${x.fromCarry ? ':carry' : ''}`)).toEqual([
      'greenhouse:g2:read:carry',
      'ashby:a1:read',
      'greenhouse:g1:read',
      'greenhouse:g2:carried',
      'lever:l1:read',
    ]);
    const next = advance(boards, s, p, ran(p), noDead, T0);
    // Read, so off the list; a key no longer in the set is dropped.
    expect(next.state.carry).toEqual([]);
  });

  it('a carried board whose host is still backed off stays carried', () => {
    const s = state({ carry: ['greenhouse:g2'], backoff: ghOff });
    const p = pickBatch(boards, s, noDead, T0);
    expect(p.steps.some((x) => x.fromCarry)).toBe(false);
    expect(advance(boards, s, p, ran(p), noDead, T0).state.carry).toEqual([
      'greenhouse:g2',
      'greenhouse:g1',
    ]);
  });
});

describe('advance: the cursor moves only over boards processed', () => {
  const boards = gh(6);
  const keys = boards.map(setBoardKey);
  it.each([
    ['all read', {}, keys[3], 4],
    [
      'the time box stopped the third',
      { [keys[2]]: 'unstarted', [keys[3]]: 'unstarted' },
      keys[1],
      2,
    ],
    [
      'the first never started',
      Object.fromEntries(keys.slice(0, 4).map((k) => [k, 'unstarted'])),
      '',
      0,
    ],
    ['failures are processed', { [keys[1]]: 'failed', [keys[2]]: 'gone' }, keys[3], 4],
  ] as const)('%s', (_, by, cursor, passed) => {
    const p = pickBatch(boards, state(), noDead, T0, opts({ maxBoards: 4 }));
    const a = advance(boards, state(), p, ran(p, by as Record<string, ReadResult>), noDead, T0);
    expect(a.state.cursor).toBe(cursor);
    expect(a.passed).toBe(passed);
  });

  it('a 429 and the boards deferred after it are carried; the cursor passes them', () => {
    const p = pickBatch(boards, state(), noDead, T0, opts({ maxBoards: 4 }));
    const a = advance(
      boards,
      state(),
      p,
      ran(p, { [keys[1]]: 'throttled', [keys[2]]: 'deferred', [keys[3]]: 'deferred' }),
      noDead,
      T0,
    );
    expect(a.state.cursor).toBe(keys[3]);
    expect(a.state.carry).toEqual(keys.slice(1, 4));
  });

  it('reaching the last key ends the cycle; the next pick wraps', () => {
    const p = pickBatch(boards, state({ cursor: keys[3] }), noDead, T0);
    const a = advance(boards, state({ cursor: keys[3] }), p, ran(p), noDead, T0);
    expect(a.cycleDone).toBe(true);
    expect(pickBatch(boards, a.state, noDead, T0).wrapped).toBe(true);
  });

  it('a wrapped run that read nothing keeps the new cycle and starts from the top', () => {
    const s = state({ cursor: keys[5] });
    const p = pickBatch(boards, s, noDead, T0, opts({ maxBoards: 2 }));
    const all = ran(p, Object.fromEntries(keys.map((k) => [k, 'unstarted'])));
    const a = advance(boards, s, p, all, noDead, T0);
    expect(a.state).toMatchObject({ cursor: '', cycle: 1 });
    expect(pickBatch(boards, a.state, noDead, T0).wrapped).toBe(false);
  });
});

describe('advance: host backoff', () => {
  const boards = set(board('greenhouse', 'g1'), board('greenhouse', 'g2'), board('lever', 'l1'));
  const run = (s: RotationState, by: Record<string, Ran<unknown>['result']>, at = T0) => {
    const p = pickBatch(boards, s, noDead, at);
    return advance(boards, s, p, ran(p, by), noDead, at).state;
  };
  it.each([
    [0, 15 * MIN],
    [1, 30 * MIN],
    [2, 60 * MIN],
    [10, 24 * 3600e3],
  ])('after %i strikes in a row, a 429 waits %i ms', (strikes, wait) => {
    const s = state(
      strikes
        ? { backoff: { 'greenhouse.io': { until: new Date(T0 - 1).toISOString(), strikes } } }
        : {},
    );
    // Both boards answer 429: one strike per host per run.
    const next = run(s, { 'greenhouse:g1': 'throttled', 'greenhouse:g2': 'throttled' });
    expect(next.backoff['greenhouse.io']).toEqual({
      until: new Date(T0 + wait).toISOString(),
      strikes: strikes + 1,
    });
  });

  it('an answer from the host clears its backoff; a 5xx does not', () => {
    const s = state({
      backoff: {
        'greenhouse.io': { until: new Date(T0 - 1).toISOString(), strikes: 3 },
        'lever.co': { until: new Date(T0 - 1).toISOString(), strikes: 2 },
      },
    });
    const next = run(s, { 'lever:l1': 'failed' });
    expect(next.backoff['greenhouse.io']).toBeUndefined();
    expect(next.backoff['lever.co']?.strikes).toBe(2);
  });
});

describe('advance: the dead list', () => {
  const boards = gh(1);
  const key = setBoardKey(boards[0]);
  const after = (
    d: DeadBoard | undefined,
    result: Ran<unknown>['result'],
    status?: number,
    o = opts(),
  ) => {
    const dead = new Map(d ? [[key, d]] : []);
    const p = pickBatch(boards, state(), new Map(), T0, o);
    return advance(
      boards,
      state(),
      p,
      ran(p, { [key]: result }, status ? { [key]: status } : {}),
      dead,
      T0,
      o,
    );
  };
  const deadRow = (fails: number): DeadBoard => ({
    key,
    lastStatus: 404,
    fails,
    retryAt: new Date(T0 - 1).toISOString(),
    disabled: false,
    lastChecked: new Date(T0 - DAY).toISOString(),
  });

  it.each([
    [undefined, 1, 1, false],
    [deadRow(1), 2, 3, false],
    [deadRow(2), 3, 7, false],
    [deadRow(3), 4, 7, true],
  ])(
    'a 404 (before: %o) → %i in a row, retry in %i days, disabled %s',
    (d, fails, days, disabled) => {
      expect(after(d, 'gone').deadUpsert).toEqual([
        {
          key,
          lastStatus: 404,
          fails,
          retryAt: new Date(T0 + days * DAY).toISOString(),
          disabled,
          lastChecked: new Date(T0).toISOString(),
        },
      ]);
    },
  );

  it('a dead board that answers comes back', () => {
    const a = after(deadRow(2), 'ok');
    expect(a.deadRemove).toEqual([key]);
    expect(a.deadUpsert).toEqual([]);
  });

  it('a 5xx on a dead board keeps its count and moves its retry on', () => {
    const a = after(deadRow(2), 'failed', 503);
    expect(a.deadUpsert[0]).toMatchObject({
      fails: 2,
      lastStatus: 503,
      disabled: false,
      retryAt: new Date(T0 + 3 * DAY).toISOString(),
    });
  });

  it.each(['failed', 'throttled'] as const)('a %s board that was alive is not dead', (r) => {
    const a = after(undefined, r, r === 'failed' ? 500 : 429);
    expect(a.deadUpsert).toEqual([]);
    expect(a.deadRemove).toEqual([]);
  });
});

describe('runBatch: time box, per-host limit, 429s, in order', () => {
  type R = { ok: boolean; status?: number };
  const items = (hosts: string[]) => hosts.map((host, i) => ({ key: `k${i}`, host }));
  const base = { timeBoxMs: 1000, hostConcurrency: 2, globalConcurrency: 4 };

  it('never runs more than hostConcurrency per host or globalConcurrency in all', async () => {
    const now = () => 0;
    const live = new Map<string, number>();
    let peakHost = 0;
    let peakAll = 0;
    let all = 0;
    const out = await runBatch<R>(
      items(['a', 'a', 'a', 'a', 'b', 'b', 'c', 'c', 'c']),
      async ({ host }) => {
        live.set(host, (live.get(host) ?? 0) + 1);
        all++;
        peakHost = Math.max(peakHost, live.get(host)!);
        peakAll = Math.max(peakAll, all);
        await new Promise((r) => setTimeout(r, 1));
        live.set(host, live.get(host)! - 1);
        all--;
        return { ok: true };
      },
      { ...base, now, startedAt: 0 },
    );
    expect(out.every((r) => r.result === 'ok')).toBe(true);
    expect(peakHost).toBeLessThanOrEqual(2);
    expect(peakAll).toBeLessThanOrEqual(4);
  });

  it('a host in hostLimits gets its own limit', async () => {
    let live = 0;
    let peak = 0;
    await runBatch<R>(
      items(['ashbyhq.com', 'ashbyhq.com', 'ashbyhq.com']),
      async () => {
        peak = Math.max(peak, ++live);
        await new Promise((r) => setTimeout(r, 1));
        live--;
        return { ok: true };
      },
      { ...base, hostLimits: ROTATION.hostLimits, now: () => 0, startedAt: 0 },
    );
    expect(peak).toBe(1);
  });

  it('no read starts after the time box: the rest are unstarted, a prefix ran', async () => {
    let clock = 0;
    const out = await runBatch<R>(
      items(['a', 'b', 'c', 'd', 'e']),
      async () => {
        clock += 400;
        return { ok: true };
      },
      { ...base, globalConcurrency: 1, now: () => clock, startedAt: 0 },
    );
    expect(out.map((r) => r.result)).toEqual(['ok', 'ok', 'ok', 'unstarted', 'unstarted']);
  });

  it('a 429 defers the host’s later boards in this run, other hosts go on', async () => {
    const out = await runBatch<R>(
      items(['a', 'a', 'b', 'a']),
      async ({ key }) => (key === 'k0' ? { ok: false, status: 429 } : { ok: true }),
      { ...base, hostConcurrency: 1, now: () => 0, startedAt: 0 },
    );
    expect(out.map((r) => r.result)).toEqual(['throttled', 'deferred', 'ok', 'deferred']);
  });

  it('a read that throws is a failure, not unstarted', async () => {
    const out = await runBatch<R>(
      items(['a']),
      async () => {
        throw new Error('boom');
      },
      { ...base, now: () => 0, startedAt: 0 },
    );
    expect(out[0].result).toBe('failed');
  });
});

describe('keepForScan: queue or review, and remote', () => {
  const s = (verdict: 'queue' | 'review' | 'reject', remote?: boolean, location?: string) => ({
    verdict,
    posting: {
      source: 'greenhouse' as const,
      sourceId: 'x',
      title: 'Design Systems Engineer',
      company: 'Acme',
      url: 'https://x.test',
      descriptionText: '',
      ...(remote !== undefined && { remote }),
      ...(location !== undefined && { location }),
    },
  });
  it.each([
    [s('queue', true), true],
    [s('review', true), true],
    [s('reject', true), false],
    [s('queue', false, 'Remote'), false],
    [s('queue', undefined, 'Remote - US'), true],
    [s('queue', undefined, 'Hybrid - NYC'), false],
    [s('queue', undefined, 'San Francisco, CA'), false],
    [s('queue', undefined, 'United States'), true],
    [s('queue'), true],
  ])('%o → %s', (x, want) => expect(keepForScan(x)).toBe(want));
});

describe('sanitizeRotation', () => {
  it.each([
    [null, emptyRotation(T0)],
    [
      {
        cursor: 'greenhouse:x',
        cycle: 2.7,
        cycleStartedAt: 'nope',
        backoff: { 'a.io': { until: '2026-10-29T12:00:00Z' }, 'b.io': { until: 'never' } },
        carry: ['a', 'a', 3],
      },
      {
        cursor: 'greenhouse:x',
        cycle: 2,
        cycleStartedAt: new Date(T0).toISOString(),
        backoff: { 'a.io': { until: '2026-10-29T12:00:00.000Z', strikes: 1 } },
        carry: ['a'],
      },
    ],
  ])('%o', (raw, want) => expect(sanitizeRotation(raw, T0)).toEqual(want));
});

describe('rotationMath: the README numbers', () => {
  it.each([
    [[10, 10, 10], 2, 2],
    [[1000, 1000, 10], 1500, 2],
    [[], 25, 0],
  ])('runsPerCycle(%o, maxBoards %i) = %i', (jobs, maxBoards, want) =>
    expect(
      runsPerCycle(
        jobs.map((j) => ({ jobs: j })),
        opts({ maxBoards }),
      ),
    ).toBe(want),
  );

  it.each([
    // boards, roles per board, runs per cycle, hours per cycle
    [5000, 30, 200, 200 / 60],
    [5000, 100, 334, 334 / 60],
    [10_000, 30, 400, 400 / 60],
    [10_000, 100, 667, 667 / 60],
  ])('%i boards of %i roles: %i runs, %f h a cycle', (n, jobs, runs, hours) => {
    const m = rotationMath(sampleBoards(n, jobs));
    expect(m.runsPerCycle).toBe(runs);
    expect(m.hoursPerCycle).toBeCloseTo(hours, 5);
    expect(m.meetsTarget).toBe(true);
    expect(m.fitsWall).toBe(true);
    expect(m.invocationsPerMonth).toBe(43_200);
  });

  it('a run, at worst, ends inside the cron gap and the free plan’s 150 s', () => {
    expect(ROTATION.timeBoxMs + ROTATION.fetchTimeoutMs).toBeLessThan(ROTATION.cronMinutes * 60e3);
    expect(ROTATION.leaseMs).toBeGreaterThan(ROTATION.timeBoxMs + ROTATION.fetchTimeoutMs);
  });
});

describe('the committed snapshot plans a batch with no network', () => {
  it('picks the first batch in key order and walks the whole set in one cycle', () => {
    const { boards } = parseBoardSet(boardsJson);
    let s = emptyRotation(T0);
    const seen: string[] = [];
    for (let run = 0; run < runsPerCycle(boards) + 1; run++) {
      const p = pickBatch(boards, s, noDead, T0);
      if (run === runsPerCycle(boards)) {
        expect(p.wrapped).toBe(true);
        break;
      }
      seen.push(...reads(p));
      s = advance(boards, s, p, ran(p), noDead, T0).state;
    }
    expect(seen).toEqual(boards.map(setBoardKey));
  });
});
