/* global document, location -- page.evaluate callbacks run in the browser */
// Screenshot gallery harness (#115 Phase 0). Visits every top-level route, every Discover
// sub-tab and the main dialogs/menus at 1440 + 390px, light + dark, with the fictional sample
// data loaded — the before/after record for each redesign phase. A review artefact, not a
// pixel-diff gate.
//
//   npm run gallery                              # builds, serves dist/, shoots into gallery/
//   npm run gallery -- --url=https://x.vercel.app --out=gallery/after --label=after
//
// The steps find things by role + visible name and skip what a build doesn't have, so the same
// script shoots the old UI and the redesigned one. Chromium: PW_CHROMIUM_PATH (cloud sessions:
// /opt/pw-browsers/chromium-1194/chrome-linux/chrome), else Playwright's own.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [k, v = 'true'] = a.slice(2).split('=');
      return [k, v];
    }),
);
const OUT = args.out || 'gallery';
const LABEL = args.label || 'current';
const PORT = Number(args.port || 4179);
const WIDTHS = [1440, 390];
const THEMES = ['light', 'dark'];

async function serve() {
  if (args.url) return { url: args.url.replace(/\/$/, ''), stop: () => {} };
  if (args['no-build'] !== 'true') await run('npx', ['vite', 'build']);
  const child = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    stdio: 'ignore',
  });
  const url = `http://localhost:${PORT}`;
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(url)).ok) return { url, stop: () => child.kill() };
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  child.kill();
  throw new Error(`vite preview did not come up on ${url}`);
}

function run(cmd, argv) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, argv, { stdio: 'inherit' });
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Click the first visible element matching a role + name; false when the build has none. */
async function clickIf(page, role, name) {
  const el = page.getByRole(role, { name }).first();
  if (!(await el.isVisible().catch(() => false))) return false;
  await el.click();
  await page.waitForTimeout(350);
  return true;
}

async function settle(page) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
}

/** Top-level tabs: the first tablist on the page is the app's main navigation. */
async function topTabs(page) {
  return page.getByRole('tablist').first().getByRole('tab').allInnerTexts();
}

async function seed(page) {
  // Sample pipeline: the empty tracker's "Try with sample data".
  for (const name of [/^(Pipeline|Tracker)$/]) await clickIf(page, 'tab', name);
  await clickIf(page, 'button', /Try with sample data/);
  // A Discover track: first starter pack from onboarding.
  if (await clickIf(page, 'tab', /^Discover$/)) {
    await page.waitForTimeout(600);
    const pack = page.getByRole('group', { name: 'Starter tracks' }).getByRole('checkbox').first();
    if (await pack.isVisible().catch(() => false)) {
      await pack.click();
      await clickIf(page, 'button', /^Start with/);
    }
  }
}

// Dialogs and menus: [tab name, file name, steps]. Each step is [role, name]; Escape closes.
const OVERLAYS = [
  [/^(Pipeline|Tracker)$/, 'account-menu', [['button', /^(Account|More options)/]]],
  [/^(Pipeline|Tracker)$/, 'sign-in-dialog', [['button', /^Sign in$/]]],
  [/^(Pipeline|Tracker)$/, 'job-details', [['button', /^Details$/]]],
  [
    /^(Pipeline|Tracker)$/,
    'screen-jd-dialog',
    [
      ['button', /^Details$/],
      ['button', /^Screen a job description$/],
    ],
  ],
  [/^(Pipeline|Tracker)$/, 'use-template-dialog', [['button', /^Use template$/]]],
  [/^Discover$/, 'manage-track-dialog', [['button', /^Manage this track$/]]],
];

async function shoot(browser, base, theme, width, manifest) {
  const ctx = await browser.newContext({
    viewport: { width, height: width > 600 ? 900 : 844 },
    deviceScaleFactor: 1,
    colorScheme: theme,
  });
  await ctx.addInitScript((t) => {
    try {
      if (!sessionStorage.getItem('gallery_init')) {
        localStorage.clear();
        sessionStorage.setItem('gallery_init', '1');
      }
      localStorage.setItem('rjb_color_mode', t);
    } catch {
      /* storage blocked */
    }
  }, theme);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(base + '/');
  await settle(page);
  await seed(page);

  const dir = join(OUT, `${theme}-${width}`);
  mkdirSync(dir, { recursive: true });
  let n = 0;
  const snap = async (name) => {
    await settle(page);
    const file = `${String(++n).padStart(2, '0')}-${slug(name)}.jpg`;
    await page.screenshot({ path: join(dir, file), fullPage: true, type: 'jpeg', quality: 70 });
    manifest.push({
      theme,
      width,
      name,
      file: `${theme}-${width}/${file}`,
      hash: await page.evaluate(() => location.hash),
    });
  };

  for (const tab of await topTabs(page)) {
    await clickIf(page, 'tab', new RegExp(`^${tab}$`));
    await snap(tab);
    if (/^Discover$/.test(tab)) {
      const inner = page.getByRole('tabpanel').getByRole('tablist').first();
      const subs = (await inner.isVisible().catch(() => false))
        ? await inner.getByRole('tab').allInnerTexts()
        : [];
      for (const sub of subs.slice(1)) {
        await inner.getByRole('tab', { name: sub, exact: true }).click();
        await snap(`${tab} · ${sub}`);
      }
    }
  }

  for (const [tab, name, steps] of OVERLAYS) {
    await clickIf(page, 'tab', tab);
    let ok = true;
    for (const [role, label] of steps) ok = ok && (await clickIf(page, role, label));
    if (ok) {
      // Overlays: viewport shot (fullPage can't see portalled dialogs past the fold).
      await settle(page);
      const file = `${String(++n).padStart(2, '0')}-${slug(name)}.jpg`;
      await page.screenshot({ path: join(dir, file), type: 'jpeg', quality: 70 });
      manifest.push({ theme, width, name, file: `${theme}-${width}/${file}`, overlay: true });
    }
    for (let i = 0; i < 2; i++) await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    if (name === 'job-details' || name === 'screen-jd-dialog')
      await clickIf(page, 'button', /^Details$/);
  }
  await ctx.close();
  return errors;
}

const { url, stop } = await serve();
const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM_PATH || undefined,
});
const manifest = [];
const errors = [];
try {
  for (const theme of THEMES)
    for (const width of WIDTHS) errors.push(...(await shoot(browser, url, theme, width, manifest)));
} finally {
  await browser.close();
  stop();
}
mkdirSync(OUT, { recursive: true });
writeFileSync(
  join(OUT, 'manifest.json'),
  JSON.stringify(
    { label: LABEL, url, at: new Date().toISOString(), shots: manifest, errors },
    null,
    2,
  ),
);
console.log(`gallery: ${manifest.length} shots → ${OUT} (${errors.length} page errors)`);
