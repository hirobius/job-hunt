import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

// The Figma sync (figma/README.md): screen fixtures, spec, push receipts and the drift check.
// The scripts are plain Node modules; load them by path so tsc does not type them.
const load = (p: string) => import(/* @vite-ignore */ `${process.cwd()}/${p}`);

type Frame = {
  page: string;
  checksum: string;
  projection: string;
  gap?: string[];
  tree: unknown[];
};
type Spec = { clock: string; frames: Record<string, Frame> };

describe('figma sync', () => {
  it('has 130 frames: 34 states at 390 and 31 at 1440, light and dark', async () => {
    const { frames } = await load('scripts/figma/states.mjs');
    const all = frames() as { width: number; key: string }[];
    expect(all).toHaveLength(130);
    expect(all.filter((f) => f.width === 390)).toHaveLength(68);
    expect(new Set(all.map((f) => f.key)).size).toBe(130);
  });

  it('the clock is fixed on Tue, Nov 10', async () => {
    const { NOW } = await load('scripts/figma/states.mjs');
    expect(new Date(NOW).toUTCString()).toMatch(/^Tue, 10 Nov 2026/);
  });

  it('marks the GAP frames (hds#1425, hds#1426)', async () => {
    const { STATES } = await load('scripts/figma/states.mjs');
    const gaps = (STATES as { name: string; gap?: string[] }[])
      .filter((s) => s.gap)
      .map((s) => [s.name, s.gap!.join()]);
    expect(gaps).toEqual([
      ['Job / Not found / Unknown route', expect.stringContaining('hds#1425')],
      ['Dialogs / Documents / Template open', expect.stringContaining('hds#1426')],
    ]);
  });

  it('checksums are stable JSON + FNV-1a, key order free', async () => {
    const { fnv1a, stable } = await load('scripts/figma/lib.mjs');
    expect(stable({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe('{"a":[2,{"c":4,"d":3}],"b":1}');
    expect(fnv1a('')).toBe('811c9dc5');
    expect(fnv1a(stable({ a: 1, b: 2 }))).toBe(fnv1a(stable({ b: 2, a: 1 })));
  });

  it('projects what Figma can hold: leaf text, container direction', async () => {
    const { project } = await load('scripts/figma/lib.mjs');
    const tree = [
      {
        c: 'Stack',
        p: { gap: 'normal' },
        l: { dir: 'row', gapPx: 16 },
        tk: ['gap-scale-sm'],
        k: [
          { c: 'Button', p: { variant: 'primary' }, t: 'Add job' },
          { c: 'div', l: { dir: 'grid' }, k: [{ c: '#text', t: 'Hi' }] },
        ],
      },
    ];
    expect(project(tree)).toEqual([
      {
        c: 'Stack',
        d: 'row',
        k: [
          { c: 'Button', t: 'Add job' },
          { c: 'div', d: 'column', k: [{ c: '#text', t: 'Hi' }] },
        ],
      },
    ]);
  });

  it('drift: missing, extra and changed frames fail; GAP frames are expected on read-back', async () => {
    const { compare } = await load('scripts/check-figma-drift.mjs');
    const snap = {
      frames: {
        a: { checksum: '1', projection: 'p' },
        b: { checksum: '2', projection: 'q', gap: ['hds#1426'] },
      },
    };
    expect(compare(snap, { a: { checksum: '1' }, b: { checksum: '2' } }).ok).toBe(true);
    const r = compare(snap, { a: { checksum: 'x' }, c: { checksum: '3' } });
    expect(r.items.map((i: { key: string; kind: string }) => `${i.kind} ${i.key}`)).toEqual([
      'changed a',
      'missing b',
      'extra c',
    ]);
    const fig = compare(
      snap,
      { a: { projection: 'p' }, b: { projection: 'other' } },
      { field: 'projection', lenientGap: true },
    );
    expect(fig.ok).toBe(true);
    expect(fig.expected).toHaveLength(1);
  });

  it('record refuses a receipt whose Figma read-back differs from the spec', async () => {
    const { record } = await load('scripts/figma/push.mjs');
    const spec = {
      clock: 'c',
      frames: { k: { page: 'Phone 390', checksum: 'aa', projection: 'pp', tree: [] } },
    };
    const ok = record(
      spec,
      null,
      [{ frames: { k: { id: '1:2', checksum: 'aa', projection: 'pp' } } }],
      'now',
    );
    expect(ok.frames.k).toEqual({ page: 'Phone 390', id: '1:2', checksum: 'aa', projection: 'pp' });
    expect(() =>
      record(spec, null, [{ frames: { k: { id: '1:2', checksum: 'aa', projection: 'zz' } } }]),
    ).toThrow(/reads back/);
    const gone = record(spec, ok, [{ removed: [{ key: 'k', id: '1:2' }] }], 'now');
    expect(gone.frames).toEqual({});
  });

  it('the committed snapshot passes its checksum and matches the committed spec', async () => {
    const { loadSnapshot } = await load('scripts/figma/push.mjs');
    const snapshot = loadSnapshot();
    const spec = JSON.parse(fs.readFileSync('figma/spec.json', 'utf8')) as Spec;
    expect(Object.keys(spec.frames)).toHaveLength(130);
    for (const [key, f] of Object.entries(spec.frames)) {
      expect(snapshot.frames[key]?.checksum, key).toBe(f.checksum);
      expect(snapshot.frames[key]?.projection, key).toBe(f.projection);
    }
  });
});
