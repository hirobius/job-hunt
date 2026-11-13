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

  it('the snapshot, when there is one, passes its checksum and matches the spec', async () => {
    const { loadSnapshot } = await load('scripts/figma/push.mjs');
    const snapshot = loadSnapshot();
    if (!snapshot) return; // nothing pushed to Sync preview yet
    const spec = JSON.parse(fs.readFileSync('figma/spec.json', 'utf8')) as Spec;
    for (const [key, s] of Object.entries(snapshot.frames as Record<string, Frame>))
      expect(spec.frames[key]?.checksum, key).toBe(s.checksum);
  });

  it('pii-allow is an allowlist: only the public contact address', async () => {
    const { scanNote } = await load('scripts/figma/extract.mjs');
    const frame = (t: string) => ({ name: 'f', tree: [{ c: '#text', t }] });
    expect(scanNote(frame('mail hello@hirobius.com')).scan).toMatch(/pii-allow/); // pii-allow: public contact address
    expect(scanNote(frame('me@example.com')).scan).toBeUndefined();
    expect(() => scanNote(frame('someone@gmail.com'))).toThrow(/allowlist/); // pii-allow: test fixture
  });

  it('the push writes only the Sync preview page', async () => {
    // emitLite is the path the push uses. emitPush embeds the whole runtime, which is now over
    // the 15 k script limit, so it throws on size before any page check (not a page leak).
    const { emitLite, SYNC_PAGE } = await load('scripts/figma/push.mjs');
    expect(SYNC_PAGE).toBe('Sync preview');
    const runtime = fs.readFileSync('scripts/figma/figma-runtime.js', 'utf8');
    expect(runtime).toContain("if (DATA.page !== 'Sync preview') throw");
    const spec = {
      frames: {
        k: {
          page: 'Phone 390',
          name: 'n',
          width: 390,
          height: 844,
          theme: 'light',
          checksum: 'a',
          projection: 'b',
          tree: [],
        },
      },
    };
    const scripts = emitLite(spec, ['k']) as { code: string }[];
    expect(scripts.length).toBe(2);
    for (const s of scripts) {
      expect(s.code).toContain("p.name === 'Sync preview'");
      expect(s.code).not.toContain('Phone 390');
    }
    expect(scripts[1].code).toContain('"page":"Sync preview"');
  });

  // The spec walker (scripts/figma/walk.js) reads React's private DOM keys. If a React upgrade
  // renames them, this fails here, loudly, before the Figma sync silently draws nothing.
  it('React still puts __reactFiber$ and __reactProps$ keys on DOM nodes', async () => {
    const React = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { act } = await import('react');
    const host = document.createElement('div');
    document.body.appendChild(host);
    await act(async () => createRoot(host).render(React.createElement('span', { id: 'x' }, 'hi')));
    const el = host.firstElementChild as Element & Record<string, unknown>;
    const keys = Object.keys(el);
    expect(
      keys.some((k) => k.startsWith('__reactFiber$')),
      'React fiber key missing',
    ).toBe(true);
    expect(
      keys.some((k) => k.startsWith('__reactProps$')),
      'React props key missing',
    ).toBe(true);
  });
});
