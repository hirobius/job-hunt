// Runs e2e/visual.spec.ts inside the pinned Playwright image (e2e/visual-env.json, #485), so every
// baseline is drawn by the same Chromium, fonts and rasterizer wherever it runs. Extra arguments go to
// Playwright: `npm run test:visual -- --update-snapshots`.
//
// Needs Docker. The repo is mounted as is, so node_modules must be Linux x64 (a cloud session, or
// `npm ci` inside the image on a Mac). The spec refuses to run outside the image (RJB_VISUAL_IMAGE).
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const { image } = JSON.parse(
  readFileSync(new URL('../e2e/visual-env.json', import.meta.url), 'utf8'),
);
const uid = typeof process.getuid === 'function' ? `${process.getuid()}:${process.getgid()}` : null;

const args = [
  'run',
  '--rm',
  '--ipc=host',
  ...(uid ? ['--user', uid] : []),
  '-e',
  'HOME=/tmp',
  '-e',
  `RJB_VISUAL_IMAGE=${image}`,
  '-v',
  `${process.cwd()}:/work`,
  '-w',
  '/work',
  image,
  'npx',
  'playwright',
  'test',
  'e2e/visual.spec.ts',
  '--trace',
  'off',
  ...process.argv.slice(2),
];

const run = spawnSync('docker', args, { stdio: 'inherit' });
if (run.error) {
  console.error(
    `Could not start Docker (${run.error.message}). Visual baselines run only in ${image}.`,
  );
  process.exit(1);
}
process.exit(run.status ?? 1);
