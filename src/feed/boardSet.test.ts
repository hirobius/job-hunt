// The bulk board set's reader (#src-bulk): every entry checked, each board once under the sync's
// key, in a stable order, and the committed snapshot parses whole. No network.
import { describe, expect, it } from 'vitest';
import raw from './data/boards.json';
import { BOARD_KINDS, boardSetKeys, parseBoardSet, parseSetBoard, setBoardKey } from './boardSet';
import { PROBE_KINDS } from './probe';
import { boardOf } from '../tracks/sync';

const entry = (o: Record<string, unknown> = {}) => ({
  kind: 'greenhouse',
  slug: 'acme',
  company: 'Acme',
  lastChecked: '2026-10-29',
  evidence: 'url:seed',
  ...o,
});

describe('parseSetBoard', () => {
  it.each([
    ['an unknown kind', { kind: 'workday' }],
    ['no kind', { kind: undefined }],
    ['a kind in the wrong case', { kind: 'Greenhouse' }],
    ['an empty slug', { slug: '' }],
    ['a slug with a slash', { slug: 'acme/jobs' }],
    ['a slug with a space', { slug: 'ac me' }],
    ['a slug starting with a dot', { slug: '.acme' }],
    ['a slug that is not text', { slug: 42 }],
  ])('drops %s', (_, o) => {
    expect(parseSetBoard(entry(o))).toBeNull();
  });

  it.each([null, undefined, 'greenhouse:acme', 3, []])('drops a non-object (%j)', (v) => {
    expect(parseSetBoard(v)).toBeNull();
  });

  it('keeps every board kind the probe asks', () => {
    for (const kind of BOARD_KINDS) expect(parseSetBoard(entry({ kind }))?.kind).toBe(kind);
  });

  it('defaults missing fields', () => {
    expect(parseSetBoard({ kind: 'ashby', slug: 'ramp' })).toEqual({
      kind: 'ashby',
      slug: 'ramp',
      company: 'ramp',
      lastChecked: '',
      evidence: '',
    });
  });

  it('cleans what it keeps', () => {
    expect(
      parseSetBoard(
        entry({
          company: '  Acme Inc ',
          website: 'Acme.COM',
          jobs: 12.7,
          lastChecked: '29 Oct 2026',
          evidence: ' url:yc ',
        }),
      ),
    ).toEqual({
      kind: 'greenhouse',
      slug: 'acme',
      company: 'Acme Inc',
      website: 'acme.com',
      jobs: 12,
      lastChecked: '',
      evidence: 'url:yc',
    });
    expect(parseSetBoard(entry({ jobs: -1 }))).not.toHaveProperty('jobs');
    expect(parseSetBoard(entry({ jobs: '3' }))).not.toHaveProperty('jobs');
  });

  it('keeps eu only on Lever', () => {
    expect(parseSetBoard(entry({ kind: 'lever', eu: true }))?.eu).toBe(true);
    expect(parseSetBoard(entry({ kind: 'lever', eu: 'yes' }))).not.toHaveProperty('eu');
    expect(parseSetBoard(entry({ kind: 'greenhouse', eu: true }))).not.toHaveProperty('eu');
  });
});

describe('setBoardKey', () => {
  it.each([
    [{ kind: 'greenhouse', slug: 'Stripe' }, 'greenhouse:stripe'],
    [{ kind: 'lever', slug: 'Acme' }, 'lever:acme'],
    [{ kind: 'lever', slug: 'acme', eu: true }, 'lever.eu:acme'],
    [{ kind: 'ashby', slug: 'ramp', eu: true }, 'ashby:ramp'],
  ] as const)('%j → %s', (b, key) => {
    expect(setBoardKey(b)).toBe(key);
  });

  it('is the sync’s board key for the same board', () => {
    const boards = [
      ...BOARD_KINDS.map((kind) => ({ kind, slug: 'Acme-Co' })),
      { kind: 'lever' as const, slug: 'Acme', eu: true as const },
    ];
    for (const b of boards)
      expect(setBoardKey(b)).toBe(
        boardOf({ ats: b.kind, slug: b.slug, ...('eu' in b && { eu: b.eu }) }),
      );
  });
});

describe('parseBoardSet', () => {
  it('reads nothing from junk', () => {
    for (const v of [null, undefined, 'x', 1, [], { boards: 'x' }])
      expect(parseBoardSet(v)).toEqual({
        generated: '',
        note: '',
        sources: [],
        counts: {},
        boards: [],
      });
  });

  it('drops bad entries and keeps each board once, the first entry winning', () => {
    const set = parseBoardSet({
      boards: [
        entry({ slug: 'acme', company: 'First' }),
        entry({ slug: 'ACME', company: 'Second' }),
        entry({ kind: 'nope' }),
        entry({ kind: 'lever', slug: 'beta' }),
        entry({ kind: 'lever', slug: 'beta', eu: true }),
        entry({ kind: 'lever', slug: 'Beta', eu: true, company: 'Dupe' }),
        entry({ kind: 'ashby', slug: 'gamma', eu: true }),
        entry({ kind: 'ashby', slug: 'gamma' }),
        null,
      ],
    });
    expect(boardSetKeys(set)).toEqual([
      'ashby:gamma',
      'greenhouse:acme',
      'lever.eu:beta',
      'lever:beta',
    ]);
    expect(set.boards.find((b) => b.slug.toLowerCase() === 'acme')?.company).toBe('First');
    expect(set.boards.filter((b) => b.eu)).toHaveLength(1);
  });

  it('sorts by key whatever order the entries come in', () => {
    const entries = [
      entry({ kind: 'workable', slug: 'zeta' }),
      entry({ kind: 'ashby', slug: 'alpha' }),
      entry({ kind: 'greenhouse', slug: 'Mid' }),
      entry({ kind: 'greenhouse', slug: 'apple' }),
      entry({ kind: 'lever', slug: 'x', eu: true }),
    ];
    const want = boardSetKeys(parseBoardSet({ boards: entries }));
    expect(want).toEqual([...want].sort());
    expect(boardSetKeys(parseBoardSet({ boards: [...entries].reverse() }))).toEqual(want);
  });

  it('keeps the counts and sources it can read', () => {
    const set = parseBoardSet({
      generated: '2026-10-29',
      counts: { live: 3, bad: 'x' },
      sources: [{ id: 'yc', label: 'YC', url: 'https://x', licence: 'MIT' }, 'junk'],
    });
    expect(set.counts).toEqual({ live: 3 });
    expect(set.sources).toEqual([
      { id: 'yc', label: 'YC', url: 'https://x', licence: 'MIT', candidates: 0, error: '' },
    ]);
  });
});

describe('the lists stay in step', () => {
  it('BOARD_KINDS is the probe’s PROBE_KINDS', () => {
    expect([...BOARD_KINDS]).toEqual([...PROBE_KINDS]);
  });
});

describe('the committed snapshot', () => {
  const set = parseBoardSet(raw);
  const entries = (raw as { boards: unknown[] }).boards;

  it('parses with nothing dropped', () => {
    expect(entries.length).toBeGreaterThan(0);
    expect(set.boards).toHaveLength(entries.length);
  });

  it('dates and explains every board', () => {
    for (const b of set.boards) {
      expect(b.lastChecked, setBoardKey(b)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(b.evidence, setBoardKey(b)).not.toBe('');
    }
  });
});
