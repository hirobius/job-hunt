#!/usr/bin/env node
// Fidelity gate (figma/README.md): does the Figma frame look like the app?
//
//   node scripts/figma/fidelity.mjs --capture <dir> [--only <re>]
//     renders the states in Playwright and saves the viewport of each as <dir>/<slug>.png
//   node scripts/figma/fidelity.mjs --compare <figmaDir> <captureDir> [--threshold 0.9]
//     compares each Figma render (get_screenshot of the frame, saved as <figmaDir>/<slug>.png)
//     with the capture of the same state, and prints a per-frame score
//
// The score is the share of pixels that match after both images are scaled to the capture's
// size and blurred lightly (pixelmatch, YIQ threshold 0.15, anti-aliasing ignored). A frame
// fails below the threshold (default 0.9). Exit 1 on any failure or missing render.
import { mkdirSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

/** Nearest-neighbour scale of an RGBA PNG to w x h. */
function scale(png, w, h) {
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const sx = Math.min(png.width - 1, Math.floor((x * png.width) / w));
      const sy = Math.min(png.height - 1, Math.floor((y * png.height) / h));
      const i = (y * w + x) * 4;
      const j = (sy * png.width + sx) * 4;
      for (let k = 0; k < 4; k++) out.data[i + k] = png.data[j + k];
    }
  return out;
}

/** Score 0..1 of two PNG buffers; both are brought to half the capture's size. */
export function score(figmaBuf, captureBuf) {
  const cap = PNG.sync.read(captureBuf);
  const fig = PNG.sync.read(figmaBuf);
  const w = Math.round(cap.width / 2);
  const h = Math.round(cap.height / 2);
  const a = scale(cap, w, h);
  const b = scale(fig, w, h);
  const diff = pixelmatch(a.data, b.data, null, w, h, { threshold: 0.15, includeAA: false });
  return 1 - diff / (w * h);
}

export function compareDirs(figmaDir, captureDir, threshold = 0.9) {
  const rows = [];
  for (const f of readdirSync(captureDir)
    .filter((x) => x.endsWith('.png'))
    .sort()) {
    const fig = join(figmaDir, f);
    if (!existsSync(fig)) {
      rows.push({ frame: f.replace(/\.png$/, ''), score: null, ok: false });
      continue;
    }
    const s = score(readFileSync(fig), readFileSync(join(captureDir, f)));
    rows.push({ frame: f.replace(/\.png$/, ''), score: s, ok: s >= threshold });
  }
  const scores = rows
    .filter((r) => r.score !== null)
    .map((r) => r.score)
    .sort((x, y) => x - y);
  const median = scores.length ? scores[Math.floor(scores.length / 2)] : null;
  return {
    rows,
    min: scores[0] ?? null,
    median,
    fails: rows.filter((r) => !r.ok).length,
    threshold,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const arg = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
  if (arg('--capture')) {
    const dir = arg('--capture');
    mkdirSync(dir, { recursive: true });
    const { extractSpec } = await import('./extract.mjs');
    const only = arg('--only') ? new RegExp(arg('--only')) : null;
    await extractSpec({ only, shots: dir, log: console.log });
    console.log(`captures in ${dir}`);
  } else if (args.includes('--compare')) {
    const [figmaDir, captureDir] = args.slice(args.indexOf('--compare') + 1);
    const r = compareDirs(figmaDir, captureDir, Number(arg('--threshold') ?? 0.9));
    for (const row of r.rows)
      console.log(
        `${row.ok ? 'ok  ' : 'FAIL'} ${row.score === null ? ' n/a ' : row.score.toFixed(3)} ${row.frame}`,
      );
    const f = (x) => (x === null ? 'n/a' : x.toFixed(3));
    console.log(
      `fidelity: min ${f(r.min)} · median ${f(r.median)} · ${r.fails} of ${r.rows.length} below ${r.threshold}`,
    );
    process.exit(r.fails ? 1 : 0);
  } else {
    console.error(
      'usage: fidelity.mjs --capture <dir> [--only <re>] | --compare <figmaDir> <captureDir> [--threshold 0.9]',
    );
    process.exit(2);
  }
}
