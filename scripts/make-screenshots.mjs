/* global document -- page callbacks run in the browser */
// Install-sheet screenshots for the web app manifest (public/manifest.webmanifest): the Pipeline
// with the sample data, wide (1280x800) and narrow (390x844), light theme. Builds, serves dist/
// with vite preview, shoots, and writes public/screenshot-{wide,narrow}.png. Re-run after a
// visible redesign and commit the PNGs:
//
//   npm run screenshots
//
// Chromium: PW_CHROMIUM_PATH (cloud sessions: /opt/pw-browsers/chromium),
// else Playwright's own.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';

const PORT = 4179;
const SHOTS = [
  { file: 'screenshot-wide.png', width: 1280, height: 800 },
  { file: 'screenshot-narrow.png', width: 390, height: 844 },
];

function run(cmd, argv) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, argv, { stdio: 'inherit' });
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

await run('npx', ['vite', 'build']);
// Its own process group, so kill() takes vite down with the npx wrapper.
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  stdio: 'ignore',
  detached: true,
});
const stop = () => {
  try {
    process.kill(-server.pid);
  } catch {
    /* already gone */
  }
};
const url = `http://localhost:${PORT}`;
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH });
try {
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(url)).ok) break;
    } catch {
      if (i > 60) throw new Error(`vite preview did not come up on ${url}`);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  for (const { file, width, height } of SHOTS) {
    const page = await browser.newPage({ viewport: { width, height }, colorScheme: 'light' });
    // The sample data is fictional; the board's live sources are refused so nothing varies.
    await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
    await page.goto(`${url}/#/queue`);
    await page.getByRole('button', { name: 'Try with sample data' }).click();
    await page.getByRole('region', { name: /^To apply/ }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `public/${file}` });
    await page.close();
    console.log(`public/${file}`);
  }
} finally {
  await browser.close();
  stop();
}
