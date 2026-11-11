// `npm run discover:boards`: the weekly board-discovery refresh (#576 item 2). Runs the full
// discovery (`npm run boards:discover`, scripts/discover-boards.mjs: harvest + probe, with the
// probe's politeness limits and the source credits kept in boards.json), then compares the new
// src/feed/data/boards.json with the one before the run (src/feed/bulk/boardsDiff.ts).
//   - Safe: writes the PR body to node_modules/.cache/boards-refresh.md and exits 0. The caller
//     (a workflow or a scheduled task, docs/board-discovery-refresh.md) opens the PR.
//   - Not safe (over 10% of boards removed, an empty set, or no change): puts the old files back,
//     prints why and exits 2, so no PR is opened.
// Arguments after `--` go to discover-boards.mjs (for example `-- --only=hn,aggregator`).
// It never commits, pushes or opens a PR itself.
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { runnerImport } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const SET = `${root}src/feed/data/boards.json`;
const KEYS = `${root}src/feed/data/board-keys.json`;
const OUT = `${root}node_modules/.cache/boards-refresh.md`;

const oldSet = await readFile(SET, 'utf8');
const oldKeys = await readFile(KEYS, 'utf8');

const run = spawnSync(
  process.execPath,
  [`${root}scripts/discover-boards.mjs`, ...process.argv.slice(2)],
  { stdio: 'inherit' },
);
if (run.status !== 0) {
  await writeFile(SET, oldSet);
  await writeFile(KEYS, oldKeys);
  console.error(`discover-boards failed (exit ${run.status}); the old files are kept.`);
  process.exit(1);
}

const { diffBoardSets, diffMarkdown } = (await runnerImport(`${root}src/feed/bulk/boardsDiff.ts`))
  .module;
const next = JSON.parse(await readFile(SET, 'utf8'));
const diff = diffBoardSets(JSON.parse(oldSet), next);
const body = diffMarkdown(diff, next.generated);
console.log(`\n${body}\n`);

if (diff.blockers.length) {
  await writeFile(SET, oldSet);
  await writeFile(KEYS, oldKeys);
  console.error(`No PR: ${diff.blockers.join('; ')}. The old files are kept.`);
  process.exit(2);
}
await mkdir(`${root}node_modules/.cache`, { recursive: true });
await writeFile(OUT, `${body}\n`);
console.log(`PR body: ${OUT}`);
