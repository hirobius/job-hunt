#!/usr/bin/env node
// Spec extraction (figma/README.md): renders every screen fixture (states.mjs) in Playwright at
// 390 and 1440, light and dark, under the Vite dev server, and walks the React tree (walk.js) into
// a stable JSON spec with a checksum per frame.
//
//   node scripts/figma/extract.mjs            write figma/spec.json
//   node scripts/figma/extract.mjs --only Sign-in   only frames whose key matches
//   import { extractSpec } from it            used by check-figma-drift.mjs
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { chromium } from '@playwright/test';
import { frames, NOW } from './states.mjs';
import { LEAF, SPEC_SCHEMA, frameChecksum, projectionChecksum } from './lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const WALK = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'walk.js'), 'utf8');
/** HDS components drawn as one library instance: the walk keeps their text, not their insides. */

const freePort = () =>
  new Promise((res) => {
    const s = createServer();
    s.listen(0, () => {
      const p = s.address().port;
      s.close(() => res(p));
    });
  });

async function startDev() {
  const port = await freePort();
  const vite = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  const child = spawn(
    process.execPath,
    [vite, '--port', String(port), '--strictPort', '--host', '127.0.0.1'],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(url)).ok) return { url, stop: () => child.kill() };
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  child.kill();
  throw new Error('vite dev server did not start');
}

function browserPath() {
  return [process.env.PW_CHROMIUM_PATH, '/opt/pw-browsers/chromium'].find(
    (p) => p && existsSync(p),
  );
}

async function renderFrame(browser, base, f) {
  const ctx = await browser.newContext({
    viewport: { width: f.width, height: f.height },
    colorScheme: f.theme,
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
    timezoneId: 'UTC',
    locale: 'en-US',
  });
  await ctx.addInitScript((t) => localStorage.setItem('rjb_color_mode', t), f.theme);
  // Scanned at NOW, so the scan on open does not run behind the state (e2e/visual.spec.ts does the same).
  if (!f.state.autoscan)
    await ctx.addInitScript((at) => {
      if (!localStorage.getItem('rjb_autoscan'))
        localStorage.setItem(
          'rjb_autoscan',
          JSON.stringify({ finishedAt: at, newCount: 0, sourceCount: 0, found: [] }),
        );
    }, NOW);
  // No network: anything not on the dev server is refused unless a fixture answers it first.
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (r) => r.abort());
  const p = await ctx.newPage();
  await p.clock.setFixedTime(NOW);
  try {
    await f.state.run(p, base);
    await p.evaluate(() => document.fonts.ready);
    // Settled: no DOM change for 1.5 s (at most 20 s).
    await p.evaluate(
      () =>
        new Promise((done) => {
          let t = setTimeout(finish, 1500);
          const stop = setTimeout(finish, 20000);
          const mo = new MutationObserver(() => {
            clearTimeout(t);
            t = setTimeout(finish, 1500);
          });
          mo.observe(document.body, {
            subtree: true,
            childList: true,
            attributes: true,
            characterData: true,
          });
          function finish() {
            mo.disconnect();
            clearTimeout(stop);
            clearTimeout(t);
            done();
          }
        }),
    );
    await p.mouse.move(0, 0);
    await p.addScriptTag({ content: WALK });
    const { found, tree } = await p.evaluate((leaf) => window.__rfWalk({ leaf }), LEAF);
    if (!found) throw new Error('no HDS exports found (is this the Vite dev server?)');
    return tree;
  } finally {
    await ctx.close();
  }
}

/** Renders the frames (all, or those matching `only`) and returns `{ key: frameSpec }`. */
export async function extractSpec({ only, log = () => {} } = {}) {
  const list = frames().filter((f) => !only || only.test(f.key));
  const dev = await startDev();
  const browser = await chromium.launch({ executablePath: browserPath() });
  const out = {};
  const errors = [];
  try {
    const q = [...list];
    await Promise.all(
      Array.from({ length: Number(process.env.FIGMA_SPEC_WORKERS || 4) }, async () => {
        while (q.length) {
          const f = q.shift();
          try {
            const tree = await renderFrame(browser, dev.url, f);
            const spec = {
              page: f.page,
              name: f.name,
              width: f.width,
              height: f.height,
              theme: f.theme,
              ...(f.state.gap ? { gap: f.state.gap } : {}),
              tree,
            };
            spec.checksum = frameChecksum(spec);
            spec.projection = projectionChecksum(spec);
            out[f.key] = scanNote(spec);
            log(`  ${spec.checksum} ${f.key}`);
          } catch (e) {
            errors.push(`${f.key}: ${String(e.message).split('\n')[0]}`);
          }
        }
      }),
    );
  } finally {
    await browser.close();
    dev.stop();
  }
  if (errors.length)
    throw new Error(`could not render ${errors.length} frame(s):\n  ${errors.join('\n  ')}`);
  return Object.fromEntries(
    Object.keys(out)
      .sort()
      .map((k) => [k, out[k]]),
  );
}

export const specFile = (framesByKey) => ({
  schemaVersion: SPEC_SCHEMA,
  clock: new Date(NOW).toISOString(),
  frames: framesByKey,
});

// The repo's pre-push scan (scripts/hooks/secret-pii-scan.mjs) flags e-mail addresses outside
// example.com. A frame whose app copy holds one (the public contact address on the legal page, or
// a fixture address run into the next word) carries a reviewed `pii-allow` note on its own line.
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const EXAMPLE = /@(?:[\w-]+\.)*(?:example\.(?:com|org|net)|localhost)$/i;
export function scanNote(spec) {
  const found = [...JSON.stringify(spec.tree).matchAll(EMAIL)].some((m) => !EXAMPLE.test(m[0]));
  if (!found) return spec;
  return {
    ...spec,
    scan: 'pii-allow: app copy (the public contact address, or a fixture address run into the next word)',
  };
}

/** figma/spec.json text: one frame per line, so a frame's note sits on the line it is about. */
export function specText(file) {
  const keys = Object.keys(file.frames).sort();
  const lines = keys.map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(file.frames[k])}`);
  return `{"schemaVersion": ${file.schemaVersion}, "clock": ${JSON.stringify(file.clock)}, "frames": {\n${lines.join(',\n')}\n}}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--only');
  const only = i > 0 ? new RegExp(process.argv[i + 1]) : null;
  const frames_ = await extractSpec({ only, log: console.log });
  const path = join(ROOT, 'figma', 'spec.json');
  mkdirSync(dirname(path), { recursive: true });
  let merged = frames_;
  if (only && existsSync(path))
    merged = { ...JSON.parse(readFileSync(path, 'utf8')).frames, ...frames_ };
  merged = Object.fromEntries(
    Object.keys(merged)
      .sort()
      .map((k) => [k, merged[k]]),
  );
  writeFileSync(path, specText(specFile(merged)));
  console.log(`wrote figma/spec.json: ${Object.keys(merged).length} frames`);
}
