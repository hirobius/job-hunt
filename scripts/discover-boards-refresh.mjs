// `npm run discover:boards`: the weekly board-discovery refresh (#576 item 2). Runs the full
// discovery (`npm run boards:discover`, scripts/discover-boards.mjs: harvest + probe, with the
// probe's politeness limits and the source credits kept in boards.json; it lays the run over the
// committed set, src/feed/bulk/refresh.ts, so an unknown answer or one 404 never drops a board),
// then compares the new src/feed/data/boards.json with the one before the run
// (src/feed/bulk/boardsDiff.ts).
//   - Safe: writes the PR body to node_modules/.cache/boards-refresh.md and exits 0. The caller
//     (a workflow or a scheduled task, docs/board-discovery-refresh.md) opens the PR.
//   - No change: puts the old files back and exits 2, so no PR is opened.
//   - Unsafe (a source failed, a kind lost over 25%, over 10% removed, an empty set): puts the old
//     files back, prints why and exits 3, so the run shows as failed and no PR is opened.
// `--help` prints the options (refresh.ts REFRESH_USAGE) with no network; an unknown option exits 1.
// It never commits, pushes or opens a PR itself.
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { runnerImport } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const SET = `${root}src/feed/data/boards.json`;
const KEYS = `${root}src/feed/data/board-keys.json`;
const OUT = `${root}node_modules/.cache/boards-refresh.md`;

const R = (await runnerImport(`${root}src/feed/bulk/refresh.ts`)).module;
const parsed = R.parseRefreshArgs(process.argv.slice(2));
if (parsed.help) {
  console.log(R.REFRESH_USAGE);
  process.exit(0);
}
if (parsed.error) {
  console.error(`${parsed.error}\n\n${R.REFRESH_USAGE}`);
  process.exit(1);
}

const oldSet = await readFile(SET, 'utf8');
const oldKeys = await readFile(KEYS, 'utf8');
const restore = async () => {
  await writeFile(SET, oldSet);
  await writeFile(KEYS, oldKeys);
};

const run = spawnSync(process.execPath, [`${root}scripts/discover-boards.mjs`, ...parsed.args], {
  stdio: 'inherit',
});
if (run.status !== 0) {
  await restore();
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
  await restore();
  console.error(`No PR: ${diff.blockers.join('; ')}. The old files are kept.`);
  process.exit(diff.unsafe ? 3 : 2);
}
await mkdir(`${root}node_modules/.cache`, { recursive: true });
await writeFile(OUT, `${body}\n`);
console.log(`PR body: ${OUT}`);
