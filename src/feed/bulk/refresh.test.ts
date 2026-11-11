import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { setBoardKey, type BoardSet, type SetBoard } from '../boardSet';
import { diffBoardSets } from './boardsDiff';
import {
  MAX_MISSES,
  carryForward,
  jobsBucket,
  parseRefreshArgs,
  previousCandidates,
  serializeBoardSet,
} from './refresh';

const board = (slug: string, o: Partial<SetBoard> = {}): SetBoard => ({
  kind: 'greenhouse',
  slug,
  company: slug,
  jobs: 10,
  lastChecked: '2026-10-29',
  evidence: 'url:hn',
  ...o,
});
const set = (generated: string, boards: SetBoard[]) => ({ generated, boards });
const key = (slug: string) => setBoardKey(board(slug));
const WEEK1 = '2026-11-16';
const WEEK2 = '2026-11-23';
const WEEK3 = '2026-11-30';

describe('jobsBucket', () => {
  it.each([
    [0, 0],
    [-3, 0],
    [1, 1],
    [2, 2],
    [4, 5],
    [7, 7],
    [8, 10],
    [11, 15],
    [16, 20],
    [101, 150],
    [5022, 7000],
  ])('%i → %i (rounded up, so the rotation never packs more roles than it thinks)', (n, want) =>
    expect(jobsBucket(n)).toBe(want),
  );
});

describe('carryForward', () => {
  it('keeps a board that answered unknown, or was not asked, exactly as it was', () => {
    const old = board('quiet', { jobs: 7 });
    const r = carryForward(set('2026-11-09', [old]), { boards: [], noneKeys: [] }, WEEK1);
    expect(r.boards).toEqual([old]);
    expect(r.boards[0]).toBe(old);
    expect(r).toMatchObject({ carried: 1, dropped: [], missed: [] });
  });

  it('keeps a board its source stopped listing: the set itself makes it a candidate', () => {
    const prev = { boards: [board('acme', { company: 'Acme', website: 'acme.com' })] };
    expect(previousCandidates(prev)).toEqual([
      {
        board: { kind: 'greenhouse', slug: 'acme' },
        company: 'Acme',
        website: 'acme.com',
        sources: [],
      },
    ]);
    expect(
      previousCandidates({ boards: [board('x', { kind: 'lever', eu: true })] })[0].board,
    ).toEqual({ kind: 'lever', slug: 'x', eu: true });
  });

  it('keeps a board after one 404 (misses 1), and only drops it at the third weekly 404 in a row', () => {
    let s = set('2026-11-09', [board('gone'), board('stays')]);
    const live = [board('stays')];
    const week = (today: string) => {
      const r = carryForward(s, { boards: live, noneKeys: [key('gone')] }, today);
      s = set(today, r.boards);
      return r;
    };
    const w1 = week(WEEK1);
    expect(w1.boards.find((b) => b.slug === 'gone')).toMatchObject({ misses: 1 });
    expect(w1.missed.map((b) => b.slug)).toEqual(['gone']);
    expect(w1.dropped).toEqual([]);
    expect(week(WEEK2).boards.find((b) => b.slug === 'gone')).toMatchObject({ misses: 2 });
    const w3 = week(WEEK3);
    expect(MAX_MISSES).toBe(3);
    expect(w3.dropped.map((b) => b.slug)).toEqual(['gone']);
    expect(w3.boards.map((b) => b.slug)).toEqual(['stays']);
  });

  it('counts no second miss for a re-run in the same week', () => {
    const prev = set(WEEK1, [board('gone', { misses: 1 })]);
    const r = carryForward(prev, { boards: [], noneKeys: [key('gone')] }, '2026-11-18');
    expect(r.boards[0].misses).toBe(1);
    expect(r.dropped).toEqual([]);
  });

  it('clears the misses when the board answers live again; unknown neither counts nor clears', () => {
    const prev = set('2026-11-09', [board('back', { misses: 2 }), board('unsure', { misses: 2 })]);
    const r = carryForward(prev, { boards: [board('back')], noneKeys: [] }, WEEK1);
    expect(r.boards.find((b) => b.slug === 'back')).not.toHaveProperty('misses');
    expect(r.boards.find((b) => b.slug === 'unsure')).toMatchObject({ misses: 2 });
  });

  it('rewrites a line only when the roles move a step (then lastChecked moves too)', () => {
    const prev = set('2026-11-09', [board('same', { jobs: 9 }), board('grew', { jobs: 9 })]);
    const r = carryForward(
      prev,
      {
        boards: [
          board('same', { jobs: 10, lastChecked: WEEK1, evidence: 'url:github' }),
          board('grew', { jobs: 40, lastChecked: WEEK1 }),
        ],
        noneKeys: [],
      },
      WEEK1,
    );
    expect(r.boards.find((b) => b.slug === 'same')).toBe(prev.boards[0]);
    expect(r.boards.find((b) => b.slug === 'grew')).toEqual(
      board('grew', { jobs: 50, lastChecked: WEEK1 }),
    );
  });

  it('adds a new live board with its roles on a step, in key order', () => {
    const r = carryForward(
      set('2026-11-09', [board('b')]),
      { boards: [board('a', { jobs: 12, lastChecked: WEEK1 })], noneKeys: [key('nope')] },
      WEEK1,
    );
    expect(r.boards.map((b) => [b.slug, b.jobs])).toEqual([
      ['a', 15],
      ['b', 10],
    ]);
  });

  it('a run that answers what the committed set already says changes no line', () => {
    const text = readFileSync('src/feed/data/boards.json', 'utf8');
    const prev = JSON.parse(text) as BoardSet;
    // Every board live again with the same roles, a week later.
    const r = carryForward(
      prev,
      { boards: prev.boards.map((b) => ({ ...b })), noneKeys: [] },
      '2026-12-01',
    );
    expect(r.boards).toHaveLength(prev.boards.length);
    expect(serializeBoardSet({ ...prev, boards: r.boards })).toBe(text);
    expect(diffBoardSets(prev, { ...prev, boards: r.boards }).blockers).toEqual(['no change']);
  });
});

describe('parseRefreshArgs', () => {
  it('asks for help on --help or -h, before anything else', () => {
    expect(parseRefreshArgs(['--help'])).toEqual({ help: true });
    expect(parseRefreshArgs(['--only=seed', '-h'])).toEqual({ help: true });
  });

  it('passes the known options on', () => {
    const argv = ['--only=seed,hn', '--limit=5', '--cached-only', '--dry', '--from-year=2020'];
    expect(parseRefreshArgs(argv)).toEqual({ args: argv });
    expect(parseRefreshArgs([])).toEqual({ args: [] });
  });

  it.each([
    [['--hlep'], /unknown option --hlep/],
    [['--only=seed,yc'], /unknown source yc/],
    [['--only='], /unknown source/],
    [['--limit=five'], /whole number/],
    [['--limit'], /unknown option --limit/],
    [['seed'], /unknown option seed/],
  ])('rejects %j', (argv, msg) => {
    const r = parseRefreshArgs(argv);
    expect('error' in r && r.error).toMatch(msg);
  });
});
