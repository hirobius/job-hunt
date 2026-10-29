import { describe, expect, it } from 'vitest';
import boardsJson from '../feed/data/boards.json';
import { parseBoardSet, setBoardKey, type SetBoard } from '../feed/boardSet.ts';
import {
  advance,
  batchReadMs,
  classify,
  emptyRotation,
  hostOf,
  keepForScan,
  orderKey,
  pickBatch,
  ROTATION,
  rotationMath,
  rotationOrder,
  runBatch,
  runsPerCycle,
  sampleBoards,
  sanitizeRotation,
  type BatchPick,
  type DeadBoard,
  type Ran,
  type ReadResult,
  type RotationOptions,
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
const set = (...boards: SetBoard[]) => parseBoardSet({ boards }).boards;
const many = (kind: SetBoard['kind'], n: number, jobs = 10) =>
  Array.from({ length: n }, (_, i) => board(kind, `${kind[0]}${String(i).padStart(2, '0')}`, jobs));
/** Board keys in walk order. */
const walkKeys = (boards: readonly SetBoard[]) => rotationOrder(boards).map((x) => x.key);
const opts = (o: Partial<RotationOptions> = {}): RotationOptions => ({ ...ROTATION, ...o });
const state = (s: Partial<RotationState> = {}): RotationState => ({ ...emptyRotation(T0), ...s });
const noDead = new Map<string, DeadBoard>();
const reads = (p: BatchPick) => p.steps.filter((s) => s.action === 'read').map((s) => s.key);
const actions = (p: BatchPick) =>
  p.steps.map((s) => `${s.key}:${s.action}${s.fromCarry ? ':carry' : ''}`);
/** Every read of a pick came back `ok`, unless `by` says otherwise. */
const ran = (
  p: BatchPick,
  by: Record<string, ReadResult> = {},
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
const ghOff = (until = T0 + MIN, strikes = 1) => ({
  'greenhouse.io': { until: new Date(until).toISOString(), strikes },
});

describe('hostOf: the registrable domain of the board read (feed/hostKey.ts)', () => {
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

describe('rotationOrder: hosts interleaved, each board’s place stable', () => {
  const boards = set(...many('greenhouse', 30), ...many('lever', 30));
  it('a board’s order value depends on its key alone', () => {
    const fewer = set(...many('greenhouse', 30).slice(5), ...many('lever', 10));
    const place = new Map(rotationOrder(boards).map((x) => [x.key, x.order]));
    for (const x of rotationOrder(fewer)) expect(x.order).toBe(place.get(x.key));
    expect(orderKey('greenhouse:g01')).toMatch(/^[0-9a-f]{8}\|greenhouse:g01$/);
  });
  it('is not grouped by host: the first 20 hold both hosts', () => {
    const first = rotationOrder(boards)
      .slice(0, 20)
      .map((x) => x.board.kind);
    expect(new Set(first)).toEqual(new Set(['greenhouse', 'lever']));
  });
  it('is sorted by order value', () => {
    const o = rotationOrder(boards).map((x) => x.order);
    expect(o).toEqual([...o].sort());
  });
});

describe('pickBatch: the cursor, the batch size, wrapping', () => {
  const boards = set(...many('greenhouse', 10));
  const keys = walkKeys(boards);
  const at = (i: number) => orderKey(keys[i]);
  it.each([
    ['from the start', '', 4, keys.slice(0, 4), false, 0],
    ['after the cursor', at(3), 4, keys.slice(4, 8), false, 0],
    ['stops at the end of the list, no wrap in the same run', at(7), 4, keys.slice(8), false, 0],
    ['wraps past the last one and bumps the cycle', at(9), 4, keys.slice(0, 4), true, 1],
  ])('%s', (_, cursor, maxBoards, want, wrapped, cycle) => {
    const p = pickBatch(boards, state({ cursor }), noDead, T0, opts({ maxBoards }));
    expect(reads(p)).toEqual(want);
    expect(p.wrapped).toBe(wrapped);
    expect(p.cycle).toBe(cycle);
  });

  it('a wrap starts the cycle clock', () => {
    const p = pickBatch(boards, state({ cursor: at(9), cycle: 3 }), noDead, T0 + DAY);
    expect(p).toMatchObject({
      cycle: 4,
      startCursor: '',
      cycleStartedAt: new Date(T0 + DAY).toISOString(),
    });
  });

  it.each([
    ['big boards fill the roles budget first', [600, 600, 600, 600], 1000, 2],
    ['one board over the budget is still read', [5000, 5000], 1000, 1],
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
  const boards = set(...many('greenhouse', 4));
  const keys = walkKeys(boards);
  const dead = (fails: number, retryAt: number, disabled = false): DeadBoard => ({
    key: keys[1],
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

describe('pickBatch: a backed-off host is carried and never blocks the walk', () => {
  const boards = set(...many('greenhouse', 4), ...many('lever', 4));
  const order = rotationOrder(boards);
  const isGh = (k: string) => k.startsWith('greenhouse');

  it('passes the host’s boards as defer and reads the rest', () => {
    const p = pickBatch(boards, state({ backoff: ghOff() }), noDead, T0);
    expect(actions(p)).toEqual(order.map((x) => `${x.key}:${isGh(x.key) ? 'defer' : 'read'}`));
  });

  it('an expired backoff reads as usual', () => {
    expect(
      reads(pickBatch(boards, state({ backoff: ghOff() }), noDead, T0 + 2 * MIN)),
    ).toHaveLength(8);
  });

  it('a full carry list passes the board as overflow: the walk goes on, the carry stays capped', () => {
    const o = opts({ maxCarry: 1 });
    const s = state({ backoff: ghOff() });
    const p = pickBatch(boards, s, noDead, T0, o);
    const gh = order.filter((x) => isGh(x.key)).map((x) => x.key);
    expect(p.steps.filter((x) => x.action === 'defer').map((x) => x.key)).toEqual([gh[0]]);
    expect(p.steps.filter((x) => x.action === 'overflow').map((x) => x.key)).toEqual(gh.slice(1));
    expect(reads(p)).toHaveLength(4);
    const a = advance(boards, s, p, ran(p), noDead, T0, o);
    expect(a.state.carry).toEqual([gh[0]]);
    expect(a.overflow).toEqual(gh.slice(1));
    expect(a.state.cursor).toBe(order[7].order);
  });

  it('a run passes at most maxWalk boards', () => {
    const p = pickBatch(boards, state({ backoff: ghOff() }), noDead, T0, opts({ maxWalk: 3 }));
    expect(p.steps).toHaveLength(3);
  });

  it('carried boards are read first once their host is free, and passed by the walk', () => {
    const k = order[2].key;
    const s = state({ carry: [k, 'gone:board'] });
    const p = pickBatch(boards, s, noDead, T0);
    expect(actions(p)).toEqual([
      `${k}:read:carry`,
      ...order.map((x) => `${x.key}:${x.key === k ? 'carried' : 'read'}`),
    ]);
    // Read, so off the list; a key no longer in the set is dropped.
    expect(advance(boards, s, p, ran(p), noDead, T0).state.carry).toEqual([]);
  });

  it('a carried board whose host is still backed off stays carried', () => {
    const k = order.find((x) => isGh(x.key))!.key;
    const s = state({ carry: [k], backoff: ghOff() });
    const p = pickBatch(boards, s, noDead, T0);
    expect(p.steps.some((x) => x.fromCarry)).toBe(false);
    const carry = advance(boards, s, p, ran(p), noDead, T0).state.carry;
    expect(carry[0]).toBe(k);
    expect(new Set(carry)).toEqual(new Set(order.filter((x) => isGh(x.key)).map((x) => x.key)));
  });
});

describe('advance: the cursor moves only over boards processed', () => {
  const boards = set(...many('greenhouse', 6));
  const keys = walkKeys(boards);
  const at = (i: number) => orderKey(keys[i]);
  const un = (...i: number[]) => Object.fromEntries(i.map((n) => [keys[n], 'unstarted' as const]));
  it.each([
    ['all read', {}, at(3), 4],
    ['the time box stopped the third and fourth', un(2, 3), at(1), 2],
    ['a later one read, an earlier one not: the cursor stops at the earlier', un(1), at(0), 1],
    ['the first never started', un(0, 1, 2, 3), '', 0],
    ['failures are processed', { [keys[1]]: 'failed', [keys[2]]: 'gone' }, at(3), 4],
  ] as const)('%s', (_, by, cursor, passed) => {
    const p = pickBatch(boards, state(), noDead, T0, opts({ maxBoards: 4 }));
    const a = advance(boards, state(), p, ran(p, by as Record<string, ReadResult>), noDead, T0);
    expect(a.state.cursor).toBe(cursor);
    expect(a.passed).toBe(passed);
  });

  it('a 429 and the boards deferred after it are carried; the cursor passes them', () => {
    const p = pickBatch(boards, state(), noDead, T0, opts({ maxBoards: 4 }));
    const by = { [keys[1]]: 'throttled', [keys[2]]: 'deferred', [keys[3]]: 'deferred' } as const;
    const a = advance(boards, state(), p, ran(p, by), noDead, T0);
    expect(a.state.cursor).toBe(at(3));
    expect(a.state.carry).toEqual(keys.slice(1, 4));
  });

  it('carry from 429s never passes maxCarry: the rest overflow', () => {
    const o = opts({ maxBoards: 4, maxCarry: 3 });
    const s = state({ carry: [keys[5]] });
    const p = pickBatch(boards, s, noDead, T0, o);
    const by = { [keys[0]]: 'throttled', [keys[1]]: 'deferred', [keys[2]]: 'deferred' } as const;
    // The carried board's host is greenhouse too: it was read from the carry first.
    const a = advance(boards, s, p, ran(p, { ...by, [keys[5]]: 'throttled' }), noDead, T0, o);
    expect(a.state.carry).toHaveLength(3);
    expect(a.state.carry).toEqual([keys[5], keys[0], keys[1]]);
    expect(a.overflow).toEqual([keys[2]]);
  });

  it('reaching the last board ends the cycle; the next pick wraps', () => {
    const s = state({ cursor: at(3) });
    const p = pickBatch(boards, s, noDead, T0);
    const a = advance(boards, s, p, ran(p), noDead, T0);
    expect(a.cycleDone).toBe(true);
    expect(pickBatch(boards, a.state, noDead, T0).wrapped).toBe(true);
  });

  it('a wrapped run that read nothing keeps the new cycle and starts from the top', () => {
    const s = state({ cursor: at(5) });
    const p = pickBatch(boards, s, noDead, T0, opts({ maxBoards: 2 }));
    const a = advance(boards, s, p, ran(p, un(0, 1, 2, 3, 4, 5)), noDead, T0);
    expect(a.state).toMatchObject({ cursor: '', cycle: 1 });
    expect(pickBatch(boards, a.state, noDead, T0).wrapped).toBe(false);
  });
});

describe('advance: host backoff', () => {
  const boards = set(board('greenhouse', 'g1'), board('greenhouse', 'g2'), board('lever', 'l1'));
  const run = (s: RotationState, by: Record<string, ReadResult>) => {
    const p = pickBatch(boards, s, noDead, T0);
    return advance(boards, s, p, ran(p, by), noDead, T0).state;
  };
  it.each([
    [0, 15 * MIN],
    [1, 30 * MIN],
    [2, 60 * MIN],
    [10, 24 * 3600e3],
  ])('after %i strikes in a row, a 429 waits %i ms', (strikes, wait) => {
    const s = state(strikes ? { backoff: ghOff(T0 - 1, strikes) } : {});
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
        ...ghOff(T0 - 1, 3),
        'lever.co': { until: new Date(T0 - 1).toISOString(), strikes: 2 },
      },
    });
    const next = run(s, { 'lever:l1': 'failed' });
    expect(next.backoff['greenhouse.io']).toBeUndefined();
    expect(next.backoff['lever.co']?.strikes).toBe(2);
  });
});

describe('advance: the dead list', () => {
  const boards = set(board('greenhouse', 'g1'));
  const key = setBoardKey(boards[0]);
  const after = (d: DeadBoard | undefined, result: ReadResult, status?: number) => {
    const dead = new Map(d ? [[key, d]] : []);
    const p = pickBatch(boards, state(), new Map(), T0);
    const r = ran(p, { [key]: result }, status ? { [key]: status } : {});
    return advance(boards, state(), p, r, dead, T0);
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
    expect(after(deadRow(2), 'failed', 503).deadUpsert[0]).toMatchObject({
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

describe('runBatch: time box, per-host limit, 429s, any ready read starts', () => {
  type R = { ok: boolean; status?: number };
  const items = (hosts: string[]) => hosts.map((host, i) => ({ key: `k${i}`, host }));
  const base = { timeBoxMs: 1000, hostConcurrency: 2, globalConcurrency: 4 };
  const tick = () => new Promise((r) => setTimeout(r, 1));

  it('never runs more than hostConcurrency per host or globalConcurrency in all', async () => {
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
        await tick();
        live.set(host, live.get(host)! - 1);
        all--;
        return { ok: true };
      },
      { ...base, now: () => 0, startedAt: 0 },
    );
    expect(out.every((r) => r.result === 'ok')).toBe(true);
    expect(peakHost).toBeLessThanOrEqual(2);
    expect(peakAll).toBeLessThanOrEqual(4);
  });

  it('a full host doesn’t hold up the others: later hosts start while it waits', async () => {
    const started: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const done = runBatch<R>(
      items(['a', 'a', 'a', 'b', 'c']),
      async ({ key, host }) => {
        started.push(key);
        if (host === 'a') await gate;
        return { ok: true };
      },
      { ...base, hostConcurrency: 1, now: () => 0, startedAt: 0 },
    );
    await tick();
    // k0 holds host a; b and c went ahead of k1 and k2.
    expect(started).toEqual(['k0', 'k3', 'k4']);
    release();
    expect((await done).map((r) => r.result)).toEqual(['ok', 'ok', 'ok', 'ok', 'ok']);
  });

  it('a host in hostLimits gets its own limit', async () => {
    let live = 0;
    let peak = 0;
    await runBatch<R>(
      items(['ashbyhq.com', 'ashbyhq.com', 'ashbyhq.com']),
      async () => {
        peak = Math.max(peak, ++live);
        await tick();
        live--;
        return { ok: true };
      },
      { ...base, hostLimits: ROTATION.hostLimits, now: () => 0, startedAt: 0 },
    );
    expect(peak).toBe(1);
  });

  it('no read starts after the time box: the rest are unstarted', async () => {
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
  const cursor = orderKey('greenhouse:x');
  it.each([
    [null, emptyRotation(T0)],
    [{ cursor: 'greenhouse:x' }, emptyRotation(T0)],
    [
      {
        cursor,
        cycle: 2.7,
        cycleStartedAt: 'nope',
        backoff: { 'a.io': { until: '2026-10-29T12:00:00Z' }, 'b.io': { until: 'never' } },
        carry: ['a', 'a', 3],
      },
      {
        cursor,
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
    // one host of 3, 6 in all: 9 boards = 3 rounds; Ashby 1 at a time: 3 boards = 3 rounds
    [many('greenhouse', 9), 3 * ROTATION.estReadMs],
    [[...many('greenhouse', 3), ...many('lever', 3)], ROTATION.estReadMs],
    [many('ashby', 3), 3 * ROTATION.estReadMs],
  ])('batchReadMs %#', (batch, ms) => expect(batchReadMs(batch)).toBe(ms));

  it.each([
    // boards, roles per board, runs per cycle, hours per cycle
    [5000, 30, 200, 200 / 60],
    [5000, 100, 334, 334 / 60],
    [10_000, 30, 400, 400 / 60],
    [10_000, 100, 667, 667 / 60],
  ])('%i boards of %i roles: %i runs, %f h a cycle, reads fit the box', (n, jobs, runs, hours) => {
    const m = rotationMath(sampleBoards(n, jobs));
    expect(m.runsPerCycle).toBe(runs);
    expect(m.hoursPerCycle).toBeCloseTo(hours, 5);
    expect(m.meetsTarget).toBe(true);
    expect(m.fitsWall).toBe(true);
    expect(m.fitsTimeBox).toBe(true);
    expect(m.invocationsPerMonth).toBe(43_200);
  });

  it('the lease covers the worst case: reads, then writes up to the deadline, inside 150 s', () => {
    expect(ROTATION.timeBoxMs + ROTATION.fetchTimeoutMs).toBeLessThan(ROTATION.writeDeadlineMs);
    expect(ROTATION.writeDeadlineMs).toBeLessThan(ROTATION.leaseMs);
    expect(ROTATION.leaseMs).toBeLessThanOrEqual(150_000);
  });
});

describe('the committed snapshot plans a batch with no network', () => {
  it('walks the whole set in one cycle, each board once, then wraps', () => {
    const { boards } = parseBoardSet(boardsJson);
    const runs = runsPerCycle(rotationOrder(boards).map((x) => x.board));
    let s = emptyRotation(T0);
    const seen: string[] = [];
    for (let run = 0; run < runs; run++) {
      const p = pickBatch(boards, s, noDead, T0);
      seen.push(...reads(p));
      s = advance(boards, s, p, ran(p), noDead, T0).state;
    }
    expect(seen).toEqual(walkKeys(boards));
    expect(pickBatch(boards, s, noDead, T0).wrapped).toBe(true);
  });
});
