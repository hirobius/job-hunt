#!/usr/bin/env node
// Figma drift check (figma/README.md), after hirobius/hds's check:figma-drift.
//
// Offline (the default, part of `npm run verify`): renders every screen fixture again
// (scripts/figma/extract.mjs) and compares each frame's checksum with the committed
// figma/snapshot.json, which records what the last push put in Figma. Any frame added, removed or
// changed in code since that push is drift: push it (figma/README.md) and commit the new snapshot.
// It also fails when figma/spec.json is not the spec the code renders now.
//
// --figma <read.json>…: compares Figma itself with the snapshot. The JSON files are the results of
// the read-*.js scripts (push.mjs --emit-read) run through use_figma, one per page. A frame whose
// read-back differs was edited in Figma after the push. Frames marked `gap` (local GAP frames for
// HDS parts that do not exist yet, hds#1425 and hds#1426) are expected to differ there, so they
// are listed but not counted.
//
// Exit codes: 0 no drift · 1 drift, or a snapshot that fails its checksum · 2 no snapshot yet.
//   node scripts/check-figma-drift.mjs [--json] [--figma <read.json>…]
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stable } from './figma/lib.mjs';
import { loadSnapshot, OWNER } from './figma/push.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Drift between a set of frames (spec or Figma read-back) and the snapshot. */
export function compare(snapshot, got, { field = 'checksum', lenientGap = false } = {}) {
  const items = [];
  const expected = [];
  for (const [key, want] of Object.entries(snapshot.frames)) {
    const have = got[key];
    if (!have) {
      items.push({ key, kind: 'missing' });
      continue;
    }
    if (have[field] !== want[field]) {
      const item = { key, kind: 'changed', want: want[field], got: have[field] };
      (lenientGap && want.gap ? expected : items).push(
        lenientGap && want.gap ? { ...item, gap: want.gap } : item,
      );
    }
  }
  for (const key of Object.keys(got)) if (!snapshot.frames[key]) items.push({ key, kind: 'extra' });
  return { ok: items.length === 0, items, expected };
}

export function format(report, where) {
  const lines = [];
  for (const i of report.items)
    lines.push(
      `  ${i.kind.padEnd(7)} ${i.key}${i.kind === 'changed' ? ` (snapshot ${i.want}, ${where} ${i.got})` : ''}`,
    );
  for (const i of report.expected) lines.push(`  GAP     ${i.key} (expected: ${i.gap.join('; ')})`);
  lines.push(
    report.ok
      ? `✓ check-figma-drift (${where}): no drift${report.expected.length ? `, ${report.expected.length} GAP frame(s) expected` : ''}`
      : `✗ check-figma-drift (${where}): ${report.items.length} frame(s) drifted. Push them (figma/README.md, "Push") and commit figma/spec.json and figma/snapshot.json.`,
  );
  return lines.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  let snapshot;
  try {
    snapshot = loadSnapshot(ROOT);
  } catch (e) {
    console.error(`✗ check-figma-drift — ${e.message}`);
    return 1;
  }
  if (!snapshot) {
    console.error(
      'No Figma snapshot yet (figma/snapshot.json): push the frames (figma/README.md), record the receipts, commit, then run this again.',
    );
    return 2;
  }

  if (args.includes('--figma')) {
    const files = args.slice(args.indexOf('--figma') + 1).filter((a) => !a.startsWith('--'));
    if (!files.length) {
      console.error('usage: check-figma-drift.mjs --figma <read.json>…');
      return 2;
    }
    const got = {};
    for (const f of files) Object.assign(got, JSON.parse(readFileSync(f, 'utf8')).frames);
    const report = compare(snapshot, got, { field: 'projection', lenientGap: true });
    console.log(
      args.includes('--json') ? JSON.stringify(report, null, 2) : format(report, 'Figma'),
    );
    return report.ok ? 0 : 1;
  }

  const { extractSpec } = await import('./figma/extract.mjs');
  const frames = await extractSpec();
  const report = compare(snapshot, frames);
  // The committed spec must be the one the code renders, so a push from it is a push of the code.
  const specPath = join(ROOT, 'figma', 'spec.json');
  const committed = existsSync(specPath) ? JSON.parse(readFileSync(specPath, 'utf8')).frames : {};
  const stale = Object.keys({ ...committed, ...frames }).filter(
    (k) => stable(committed[k]) !== stable(frames[k]),
  );
  if (stale.length) {
    report.ok = false;
    for (const key of stale)
      report.items.push({
        key,
        kind: 'spec',
        want: committed[key]?.checksum,
        got: frames[key]?.checksum,
      });
  }
  console.log(args.includes('--json') ? JSON.stringify(report, null, 2) : format(report, 'code'));
  if (stale.length)
    console.log(
      '  (spec: figma/spec.json is stale; run `node scripts/figma/extract.mjs` and commit it)',
    );
  return report.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(await main());
export { OWNER };
