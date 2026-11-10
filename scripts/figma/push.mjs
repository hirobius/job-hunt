#!/usr/bin/env node
// Push (figma/README.md): turns figma/spec.json into use_figma scripts that build the owned frames
// of "roleflame — app states" from HDS library instances, and records what Figma returned in
// figma/snapshot.json. An agent runs the scripts with the Figma MCP use_figma tool and logs each
// call in figma/MCP-LEDGER.md first. Nothing here talks to Figma by itself.
//
//   node scripts/figma/push.mjs --plan                   what a push would create, update, remove
//   node scripts/figma/push.mjs --emit <dir> [--all] [--only <re>]  write push-*.js (changed frames, or all)
//   node scripts/figma/push.mjs --record <receipt.json>… write figma/snapshot.json from receipts
//   node scripts/figma/push.mjs --emit-read <dir>        write read-*.js (check-figma-drift --figma)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fnv1a, isLeaf, stable } from './lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
export const FILE = { id: '9VCvYGN0pz9faveIhSn6Kn', name: 'roleflame — app states' };
export const OWNER = 'roleflame-figma-sync';
/** use_figma takes at most 50,000 characters of code; leave room for the wrapper. */
const MAX_SCRIPT = 15_000;
/** The one page the sync writes. The hand-checked pages are never written (figma/README.md). */
export const SYNC_PAGE = 'Sync preview';
const PAGES = [SYNC_PAGE];

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
export const loadSpec = (root = ROOT) => readJson(join(root, 'figma', 'spec.json'));
export function loadSnapshot(root = ROOT) {
  const path = join(root, 'figma', 'snapshot.json');
  if (!existsSync(path)) return null;
  const file = readJson(path);
  if (fnv1a(stable(file.snapshot)) !== file.checksum)
    throw new Error(
      'figma/snapshot.json fails its checksum: it was edited by hand. Push again and record the receipts instead.',
    );
  return file.snapshot;
}
export const snapshotText = (snapshot) =>
  `${JSON.stringify({ checksum: fnv1a(stable(snapshot)), snapshot }, null, 2)}\n`;

/** create / update / remove / same, by frame key, comparing the spec to the last recorded push. */
export function plan(spec, snapshot) {
  const had = snapshot?.frames ?? {};
  const out = { create: [], update: [], remove: [], same: [] };
  for (const [key, f] of Object.entries(spec.frames)) {
    if (!had[key]) out.create.push(key);
    else if (had[key].checksum !== f.checksum) out.update.push(key);
    else out.same.push(key);
  }
  for (const key of Object.keys(had)) if (!spec.frames[key]) out.remove.push(key);
  return out;
}

const runtime = () =>
  readFileSync(join(HERE, 'figma-runtime.js'), 'utf8').replace(/^\/\/.*\n/gm, '');
const components = () => {
  const c = readJson(join(ROOT, 'figma', 'hds-components.json'));
  const d = /id="flame-outer"[^>]*d="([^"]*)"/.exec(
    readFileSync(join(ROOT, 'public', 'favicon.svg'), 'utf8'),
  )[1];
  // Every 4th point of the flame outline is enough at 24 to 72 px.
  const pts = d.replace(/Z$/, '').slice(1).split('L');
  const short = `M${pts.filter((_, i) => i % 4 === 0).join('L')}Z`;
  const logo = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="1 5 87 115"><path fill="#1e2efd" d="${short}"/></svg>`;
  return { components: c.components, icons: c.icons, logo };
};
/**
 * The payload a push sends: what figma-runtime.js draws, as arrays. A leaf is
 * [name, text, props] (props it can match to variants: short strings, numbers, booleans); a
 * container is [name, row?, gap, [top, right, bottom, left], children]. Token classes and container
 * props stay in figma/spec.json; Figma does not need them to draw the frame.
 */
export function slim(nodes) {
  return nodes.map((n) => {
    if (isLeaf(n)) {
      const p = Object.fromEntries(
        Object.entries(n.p ?? {}).filter(([, v]) => typeof v !== 'string' || v.length <= 24),
      );
      // Layout data for the runtime (outside the checksums): measured type and the drawn icon.
      if (n.ty) p._ty = n.ty;
      if (n.ic) p._ic = n.ic;
      return Object.keys(p).length ? [n.c, n.t ?? '', p] : n.t ? [n.c, n.t] : [n.c];
    }
    const l = n.l ?? {};
    return [
      n.c,
      l.dir === 'row' ? (l.wrap ? 2 : 1) : 0,
      l.gapPx ?? 0,
      l.padPx ?? 0,
      slim(n.k ?? []),
      // Flags: bit 0 reversed flex, the rest the grid column count.
      ...(n.sz || n.rv || n.gc ? [n.sz ?? 0] : []),
      ...(n.rv || n.gc ? [(n.rv ? 1 : 0) + (n.gc > 1 ? n.gc : 0) * 2] : []),
    ];
  });
}
const minify = (code) =>
  code
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('//'))
    .join('\n');
/** Repeated names, texts, props and paddings go once into DATA.s; trees refer to them by index. */
function encode(data) {
  if (!data.frames) return data;
  const s = new Map();
  const id = (v) => {
    const k = JSON.stringify(v);
    if (!s.has(k)) s.set(k, s.size);
    return s.get(k);
  };
  const enc = (nodes) =>
    nodes.map((n) =>
      n.length >= 5 && Array.isArray(n[4])
        ? [
            id(n[0]),
            n[1],
            n[2],
            n[3] ? id(n[3]) : 0,
            enc(n[4]),
            ...(n[5] || n[6] ? [n[5] ? id(n[5]) : 0] : []),
            ...(n[6] ? [n[6]] : []),
          ]
        : n.map(id),
    );
  const frames = data.frames.map((f) => (f.tree ? { ...f, tree: enc(f.tree) } : f));
  return { ...data, frames, s: [...s.keys()].map((k) => JSON.parse(k)) };
}
/** JSON broken into lines of about 900 characters (between tokens), so the script stays readable. */
function wrapJson(json) {
  let out = '';
  let line = 0;
  let inStr = false;
  for (let i = 0; i < json.length; i++) {
    const ch = json[i];
    out += ch;
    line++;
    if (inStr) {
      if (ch === '\\') {
        out += json[++i];
        line++;
      } else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === ',' && line > 900) {
      out += '\n';
      line = 0;
    }
  }
  return out;
}
const script = (data) =>
  `const DATA = ${wrapJson(JSON.stringify(encode(data)))};\n${minify(runtime())}`;

/**
 * Light scripts for a large push: install the runtime and the HDS keys once on the Sync preview
 * page (shared plugin data), then each batch call carries only its frames and strings.
 */
export function emitLite(spec, keys, start = 1) {
  const rt = minify(runtime());
  const install = [
    "const page = figma.root.children.find((p) => p.name === 'Sync preview');",
    "if (!page) throw new Error('no Sync preview page');",
    `page.setSharedPluginData('roleflame', 'static', ${JSON.stringify(JSON.stringify(components()))});`,
    `page.setSharedPluginData('roleflame', 'runtime', ${JSON.stringify(rt)});`,
    `return { runtime: '${fnv1a(rt)}' };`,
  ].join('\n');
  const stub = [
    "const P = figma.root.children.find((p) => p.name === 'Sync preview');",
    "const RT = P.getSharedPluginData('roleflame', 'runtime');",
    'let h = 0x811c9dc5;',
    'for (let i = 0; i < RT.length; i++) { h ^= RT.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }',
    "if (h.toString(16).padStart(8, '0') !== DATA.rt) throw new Error('runtime on the page is not this version: run the install script');",
    "Object.assign(DATA, JSON.parse(P.getSharedPluginData('roleflame', 'static')));",
    "return await new (Object.getPrototypeOf(async function () {}).constructor)('DATA', RT)(DATA);",
  ].join('\n');
  const out = [{ name: 'install', keys: [], code: install }];
  const lite = (frames, n) =>
    `const DATA = ${wrapJson(JSON.stringify(encode({ mode: 'push', page: SYNC_PAGE, owner: OWNER, keep: null, rt: fnv1a(rt), section: `batch ${String(start).padStart(2, '0')}`, frames })))};\n${stub}`;
  let batch = [];
  let n = start;
  const flush = () => {
    if (!batch.length) return;
    out.push({
      // Every part writes to one section, "batch <start>".
      name: `batch ${String(start).padStart(2, '0')}-part-${String(n - start + 1).padStart(2, '0')}`,
      keys: batch.map((f) => f.key),
      code: lite(batch, n),
    });
    n++;
    batch = [];
  };
  for (const key of keys) {
    const { name, width, height, theme, checksum, projection, gap, tree } = spec.frames[key];
    const f = { key, name, width, height, theme, checksum, projection, gap, tree: slim(tree) };
    const twin = batch.find((b) => b.tree && stable(b.tree) === stable(f.tree));
    if (twin) {
      f.same = twin.key;
      delete f.tree;
    }
    if (batch.length && lite([...batch, f], n).length > MAX_SCRIPT) flush();
    if (f.same && !batch.some((b) => b.key === f.same)) {
      f.tree = slim(tree);
      delete f.same;
    }
    batch.push(f);
  }
  flush();
  return out;
}

/** The push scripts: per page, frames packed under the size limit; the first also removes. */
export function emitPush(spec, keys) {
  const scripts = [];
  for (const page of PAGES) {
    const keep = Object.keys(spec.frames);
    const todo = keys;
    const base = { mode: 'push', page, owner: OWNER, keep, ...components() };
    let batch = [];
    const flush = () => {
      if (!batch.length) return;
      scripts.push({
        page,
        keys: batch.map((f) => f.key),
        code: script({ ...base, frames: batch }),
      });
      batch = [];
    };
    for (const key of todo) {
      const { name, width, height, theme, checksum, projection, gap, tree } = spec.frames[key];
      const f = { key, name, width, height, theme, checksum, projection, gap, tree: slim(tree) };
      // Light and dark usually share one tree: send it once per batch.
      const twin = batch.find((b) => b.tree && stable(b.tree) === stable(f.tree));
      if (twin) {
        f.same = twin.key;
        delete f.tree;
      }
      if (batch.length && script({ ...base, frames: [...batch, f] }).length > MAX_SCRIPT) {
        flush();
        if (f.same) {
          f.tree = slim(spec.frames[key].tree);
          delete f.same;
        }
      }
      batch.push(f);
      if (script({ ...base, frames: batch }).length > MAX_SCRIPT)
        throw new Error(
          `${key} alone is over the use_figma limit (${script({ ...base, frames: batch }).length} chars)`,
        );
    }
    flush();
    // Only the first script of a page removes owned frames that left the spec.
    scripts
      .filter((x) => x.page === page)
      .slice(1)
      .forEach((x) => {
        x.code = x.code.replace(/"keep":\[[^\]]*\]/, '"keep":null');
      });
    // A page with nothing to build still removes the owned frames that left the spec.
    if (!scripts.some((s) => s.page === page))
      scripts.push({ page, keys: [], code: script({ ...base, frames: [] }) });
  }
  return scripts;
}
export const emitRead = () =>
  PAGES.map((page) => ({
    page,
    code: script({ mode: 'read', page, owner: OWNER, components: {}, icons: {} }),
  }));

/** Folds use_figma receipts into the snapshot. Refuses a frame whose Figma read-back differs. */
export function record(spec, snapshot, receipts, now = new Date().toISOString()) {
  const frames = { ...(snapshot?.frames ?? {}) };
  const bad = [];
  for (const r of receipts) {
    for (const { key } of r.removed ?? []) delete frames[key];
    for (const [key, got] of Object.entries(r.frames ?? {})) {
      const want = spec.frames[key];
      if (!want) {
        bad.push(`${key}: not in figma/spec.json`);
        continue;
      }
      if (got.checksum !== want.checksum) {
        bad.push(`${key}: pushed ${got.checksum}, spec is ${want.checksum}`);
        continue;
      }
      if (got.projection !== want.projection) {
        bad.push(`${key}: Figma reads back ${got.projection}, spec projects ${want.projection}`);
        continue;
      }
      frames[key] = {
        page: want.page,
        id: got.id,
        checksum: got.checksum,
        projection: got.projection,
        ...(want.gap ? { gap: want.gap } : {}),
      };
    }
  }
  if (bad.length) throw new Error(`receipts refused:\n  ${bad.join('\n  ')}`);
  const sorted = Object.fromEntries(
    Object.keys(frames)
      .sort()
      .map((k) => [k, frames[k]]),
  );
  return { schemaVersion: 1, file: FILE, pushedAt: now, clock: spec.clock, frames: sorted };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const arg = (n) => {
    const i = args.indexOf(n);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const spec = loadSpec();
  const snapshot = loadSnapshot();
  const p = plan(spec, snapshot);
  if (args.includes('--plan')) {
    for (const k of ['create', 'update', 'remove'])
      for (const key of p[k]) console.log(`${k.padEnd(6)} ${key}`);
    console.log(
      `plan: ${p.create.length} create · ${p.update.length} update · ${p.remove.length} remove · ${p.same.length} unchanged`,
    );
  } else if (arg('--emit')) {
    const dir = arg('--emit');
    mkdirSync(dir, { recursive: true });
    const only = arg('--only') ? new RegExp(arg('--only')) : null;
    const keys = (
      args.includes('--all') ? Object.keys(spec.frames) : [...p.create, ...p.update]
    ).filter((k) => !only || only.test(k));
    const scripts = emitPush(spec, keys);
    scripts.forEach((s, i) => {
      const file = join(dir, `push-${String(i + 1).padStart(2, '0')}.js`);
      writeFileSync(file, s.code);
      console.log(`${file}  ${s.page}  ${s.keys.length} frame(s)  ${s.code.length} chars`);
    });
    console.log(
      `${scripts.length} use_figma write(s). Log each in figma/MCP-LEDGER.md before the call; save each result as JSON and run --record.`,
    );
  } else if (arg('--emit-lite')) {
    // --emit-lite <dir> [--skip <re>]: install script, then batches of frames not on the page yet.
    const dir = arg('--emit-lite');
    mkdirSync(dir, { recursive: true });
    const skip = arg('--skip') ? new RegExp(arg('--skip')) : null;
    const keys = Object.keys(spec.frames).filter((k) => !skip || !skip.test(k));
    for (const s of emitLite(spec, keys, Number(arg('--start') ?? 1))) {
      const file = join(dir, `${s.name.replace(' ', '-')}.js`);
      writeFileSync(file, s.code);
      console.log(`${file}  ${s.keys.length} frame(s)  ${s.code.length} chars`);
      if (s.keys.length) writeFileSync(file.replace(/\.js$/, '.keys.json'), JSON.stringify(s.keys));
    }
  } else if (arg('--emit-read')) {
    const dir = arg('--emit-read');
    mkdirSync(dir, { recursive: true });
    for (const s of emitRead()) {
      const file = join(dir, `read-${s.page.replace(/\W+/g, '-').toLowerCase()}.js`);
      writeFileSync(file, s.code);
      console.log(`${file}  ${s.page}`);
    }
  } else if (args.includes('--record')) {
    const files = args.slice(args.indexOf('--record') + 1).filter((a) => !a.startsWith('--'));
    const receipts = files.map(readJson);
    const next = record(spec, snapshot, receipts);
    writeFileSync(join(ROOT, 'figma', 'snapshot.json'), snapshotText(next));
    console.log(`recorded ${Object.keys(next.frames).length} frame(s) in figma/snapshot.json`);
  } else {
    console.error(
      'usage: push.mjs --plan | --emit <dir> [--all] | --record <receipt.json>… | --emit-read <dir>',
    );
    process.exit(2);
  }
}
