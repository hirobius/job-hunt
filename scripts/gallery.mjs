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
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const i = a.indexOf('=');
      return i < 0 ? [a.slice(2), 'true'] : [a.slice(2, i), a.slice(i + 1)];
    }),
);
const OUT = args.out || 'gallery';
const LABEL = args.label || 'current';
const PORT = Number(args.port || 4179);
const WIDTHS = [1440, 390];
const CLOUD_CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
// --pack=<regex> picks the starter track by name instead of the first (the case-study set uses it).
const PACK = args.pack ? new RegExp(args.pack, 'i') : undefined;
const packBox = (page) => {
  const boxes = page.getByRole('group', { name: 'Starter tracks' }).getByRole('checkbox');
  return PACK ? boxes.filter({ hasText: PACK }).first() : boxes.first();
};
const THEMES = ['light', 'dark'];
// --format=png for lossless shots (the case-study set, #199); default is small JPEGs.
const EXT = args.format === 'png' ? 'png' : 'jpg';
const shotOpts = (path) =>
  EXT === 'png' ? { path, type: 'png' } : { path, type: 'jpeg', quality: 70 };

async function serve() {
  // A full URL may carry a query (e.g. Vercel's ?_vercel_share= for a protected preview); it is
  // the entry point, and shots navigate within that origin.
  if (args.url) return { url: args.url, stop: () => {} };
  if (args['no-build'] !== 'true') await run('npx', ['vite', 'build']);
  // Its own process group, so stop() takes down vite as well as the npx wrapper; a leftover
  // server would answer the next run's port with this build.
  const child = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    stdio: 'ignore',
    detached: true,
  });
  const stop = () => {
    try {
      process.kill(-child.pid);
    } catch {
      /* already gone */
    }
  };
  const url = `http://localhost:${PORT}`;
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(url)).ok) return { url, stop };
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  stop();
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

/** Click the first visible element matching a role + name; false when the build has none.
 *  The pseudo-role 'first-job' opens the first job's page from the Pipeline list (#129). */
async function clickIf(page, role, name) {
  const el =
    role === 'first-job'
      ? page.locator('[role="table"] a[href^="#/queue/"], article a[href^="#/queue/"]').first()
      : page.getByRole(role, { name }).first();
  if (!(await el.isVisible().catch(() => false))) return false;
  // A menu item past the bottom of a phone viewport never counts as in view; fire the click.
  await el.click({ timeout: 5000 }).catch(() => el.dispatchEvent('click'));
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
  // A Discover (Companies) track: first starter pack from onboarding.
  if (await clickIf(page, 'tab', /^(Discover|Companies)$/)) {
    await page.waitForTimeout(600);
    // Discover with no track asks first (#132); the button opens the setup.
    await clickIf(page, 'button', /^Choose a track$/);
    const pack = packBox(page);
    if (await pack.isVisible().catch(() => false)) {
      await pack.click();
      // Three steps (#132): Continue, Continue, Finish.
      await clickIf(page, 'button', /^Continue$/);
      await clickIf(page, 'button', /^Continue$/);
      await clickIf(page, 'button', /^Finish$/);
    }
  }
}

// Dialogs and menus: [tab name, file name, steps]. Each step is [role, name]; Escape closes.
const OVERLAYS = [
  [/^(Pipeline|Tracker)$/, 'account-menu', [['button', /^(Menu|Account|More options)$/]]],
  [/^(Pipeline|Tracker)$/, 'status-menu', [['button', /^Status:/]]],
  [/^(Pipeline|Tracker)$/, 'add-job-dialog', [['button', /^Add job$/]]],
  [
    /^(Pipeline|Tracker)$/,
    'sign-in-dialog',
    [
      ['button', /^(Menu|Account)$/],
      ['menuitem', /^Sign in/],
    ],
  ],
  [/^(Pipeline|Tracker)$/, 'row-menu', [['button', /^More actions/]]],
  // Rapid apply: the To apply queue's Start applying opens Apply mode on the first job.
  [/^(Pipeline|Tracker)$/, 'apply-mode', [['button', /^Start applying$/]]],
  // A job's details, screener and templates live on its page (#129 moved them off the list).
  [/^(Pipeline|Tracker)$/, 'job-page', [['first-job']]],
  // The job page's tabs (#130); the screener is inline in Screening, not a dialog.
  [/^(Pipeline|Tracker)$/, 'job-page-screening', [['first-job'], ['tab', /^Screening/]]],
  [
    /^(Pipeline|Tracker)$/,
    'job-page-screener-open',
    [['first-job'], ['tab', /^Screening/], ['button', /^Screen a job description$/]],
  ],
  [/^(Pipeline|Tracker)$/, 'job-page-interviews', [['first-job'], ['tab', /^Interviews/]]],
  [/^(Pipeline|Tracker)$/, 'job-page-todos', [['first-job'], ['tab', /^To-dos/]]],
  [/^(Pipeline|Tracker)$/, 'use-template-dialog', [['first-job'], ['button', /^Use template$/]]],
  // Templates: a row opens its editor (beside the list on a desktop, alone on a phone). Since #240
  // Templates has no tab; the Menu opens it (an older build's Templates tab still works).
  [/^Templates$/, 'template-detail', [['link', /^Cover letter/]]],
  [
    /^(Pipeline|Tracker)$/,
    'template-detail-from-menu',
    [
      ['button', /^Menu$/],
      ['menuitem', /^Templates$/],
      ['link', /^Cover letter/],
    ],
  ],
  [/^(Discover|Companies)$/, 'manage-track-dialog', [['button', /^Manage track$/]]],
  // The location and work-mode popover in the header (#131).
  [
    /^(Discover|Companies)$/,
    'discover-context-popover',
    [['button', /, (Any mode|Hybrid|On-site)$|^Remote$/]],
  ],
  // The details card in edit, and the header menu (Remove lives there).
  [/^(Pipeline|Tracker)$/, 'job-page-edit', [['first-job'], ['button', /^Edit details$/]]],
  [/^(Pipeline|Tracker)$/, 'job-page-menu', [['first-job'], ['button', /^More actions/]]],
  // Last, as it removes a job: the Undo toast, then Recently removed.
  [
    /^(Pipeline|Tracker)$/,
    'recently-removed',
    [
      ['button', /^More actions/],
      ['menuitem', /^Remove$/],
      ['button', /^Recently removed/],
    ],
  ],
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
  // Discovery tools call public APIs; answer them with canned bodies so the populated screens can be
  // shot offline (Find boards, Design-system teams). Everything else is untouched.
  const cors = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
  const canned = (body, status = 200, extra = {}) => ({
    status,
    headers: { ...cors, ...extra },
    body: JSON.stringify(body),
  });
  const ghRepo = (login, stars) => ({
    full_name: `${login}/design-system`,
    html_url: `https://github.com/${login}/design-system`,
    stargazers_count: stars,
    topics: ['design-system'],
    archived: false,
    fork: false,
    owner: { login, type: 'Organization' },
  });
  await ctx.route('https://api.github.com/**', (r) => {
    const u = r.request().url();
    if (u.includes('/search/repositories'))
      return r.fulfill(
        canned({
          items: [ghRepo('figma', 4200), ghRepo('quietco', 900), ghRepo('acme-design-labs', 310)],
        }),
      );
    if (u.endsWith('/orgs/figma')) return r.fulfill(canned({ name: 'Figma', blog: 'figma.com' }));
    if (u.endsWith('/orgs/quietco'))
      return r.fulfill(canned({ name: 'Quiet Company', blog: 'quiet.example' }));
    return r.fulfill(canned({ name: 'Acme Design Labs' }));
  });
  await ctx.route('https://boards-api.greenhouse.io/**', (r) =>
    r.request().url().includes('/boards/figma/')
      ? r.fulfill(canned({ jobs: [{}, {}, {}, {}] }))
      : r.fulfill(canned({}, 404)),
  );
  await ctx.route('https://api.lever.co/**', (r) =>
    r.request().url().includes('/postings/plaid')
      ? r.fulfill(canned([{}]))
      : r.fulfill(canned({}, 404)),
  );
  await ctx.route(
    /https:\/\/(api\.ashbyhq\.com|apply\.workable\.com|api\.eu\.lever\.co|[a-z0-9-]+\.recruitee\.com)\/.*/,
    (r) => r.fulfill(canned({}, 404)),
  );
  await ctx.route('https://yc-oss.github.io/**', (r) =>
    r.fulfill(
      canned([
        { name: 'Figma', status: 'Active', isHiring: true },
        { name: 'Plaid', status: 'Active', isHiring: true },
        { name: 'Nobody Labs', status: 'Active', isHiring: false },
        { name: 'Flaky Inc', status: 'Active', isHiring: false },
      ]),
    ),
  );
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  // CSP violations surface as console errors; record them so a build that blocks its own fonts
  // or requests is caught here.
  page.on('console', (m) => {
    if (m.type() === 'error' && /Content Security Policy/i.test(m.text())) errors.push(m.text());
  });
  await page.goto(base);
  await settle(page);

  const dir = join(OUT, `${theme}-${width}`);
  mkdirSync(dir, { recursive: true });
  let n = 0;
  const snap = async (name) => {
    await settle(page);
    const file = `${String(++n).padStart(2, '0')}-${slug(name)}.${EXT}`;
    await page.screenshot({ ...shotOpts(join(dir, file)), fullPage: true });
    manifest.push({
      theme,
      width,
      name,
      file: `${theme}-${width}/${file}`,
      hash: await page.evaluate(() => location.hash),
    });
  };

  // The landing screen before any data: what a first visit sees.
  await snap('First visit');
  // The guided first run (#132): steps 2 and 3, then back out so seed() starts from step 1.
  const firstPack = packBox(page);
  if (await firstPack.isVisible().catch(() => false)) {
    await firstPack.click();
    if (await clickIf(page, 'button', /^Continue$/)) {
      await snap('First run · location');
      if (await clickIf(page, 'button', /^Continue$/)) await snap('First run · first job');
      await clickIf(page, 'button', /^Back$/);
      await clickIf(page, 'button', /^Back$/);
    }
    await firstPack.click();
  }
  await seed(page);

  for (const tab of await topTabs(page)) {
    await clickIf(page, 'tab', new RegExp(`^${tab}$`));
    await snap(tab);
    if (/^(Discover|Companies)$/.test(tab)) {
      // The sections (tabs under "Your sections"), then each search tool (a segmented row, #131).
      const inner = page.getByRole('tabpanel').getByRole('tablist', { name: 'Your sections' });
      const subs = (await inner.isVisible().catch(() => false))
        ? await inner.getByRole('tab').allInnerTexts()
        : [];
      for (const sub of subs.slice(1)) {
        await inner.getByRole('tab', { name: sub, exact: true }).click();
        await snap(`${tab} · ${sub}`);
      }
      const tools = page.getByRole('radiogroup', { name: 'Search tool' });
      const labels = (await tools.isVisible().catch(() => false))
        ? await tools.getByRole('radio').allInnerTexts()
        : [];
      for (const label of labels.slice(1)) {
        await tools.getByRole('radio', { name: label, exact: true }).click();
        await snap(`${tab} · ${label}`);
      }
      // The companies list's secondary views (#237): Live postings and the list checker, reached
      // by their links; then the list checker populated with a YC batch through the board probe.
      const companiesTool = /^(Design-system teams|Teams|Companies)$/;
      if (labels.some((l) => companiesTool.test(l)))
        await tools.getByRole('radio', { name: companiesTool }).click();
      if (await clickIf(page, 'link', /^Live postings from job boards$/)) {
        await snap(`${tab} · Live postings`);
        await clickIf(page, 'link', /^Back to companies$/);
      }
      if (await clickIf(page, 'link', /^Check a list of companies$/)) {
        await snap(`${tab} · Check a list of companies`);
        if (await clickIf(page, 'button', /^Load batch$/)) {
          await page.waitForTimeout(500);
          if (await clickIf(page, 'button', /^Find boards$/)) {
            await page
              .getByText(/\d+ of \d+ checked/)
              .first()
              .waitFor({ timeout: 20000 })
              .catch(() => {});
            await page.waitForTimeout(4000);
            await snap(`${tab} · Boards found`);
          }
        }
        await clickIf(page, 'link', /^Back to companies$/);
      }
      if (labels.some((l) => companiesTool.test(l))) {
        await tools.getByRole('radio', { name: companiesTool }).click();
        if (await clickIf(page, 'button', /^Find design-system teams$/)) {
          await page
            .getByText(/\d+ teams? found/)
            .first()
            .waitFor({ timeout: 20000 })
            .catch(() => {});
          await page.waitForTimeout(4000); // the teams' boards are read after they are found
          await snap(`${tab} · Teams found`);
        }
      }
      // Back to the default tool before the overlays below.
      if (labels[0]) await tools.getByRole('radio', { name: labels[0], exact: true }).click();
    }
  }

  // Templates without a tab (#240): open it from the Menu and shoot the list.
  if (!(await topTabs(page)).includes('Templates')) {
    await clickIf(page, 'button', /^Menu$/);
    if (await clickIf(page, 'menuitem', /^Templates$/)) await snap('Templates');
  }

  // Let the last toast ("Saved … as a target") expire so it isn't in every overlay shot.
  await page.waitForTimeout(7000);
  for (const [tab, name, steps] of OVERLAYS) {
    await clickIf(page, 'tab', tab);
    let ok = true;
    for (const [role, label] of steps) ok = ok && (await clickIf(page, role, label));
    if (ok) {
      // Overlays: viewport shot (fullPage can't see portalled dialogs past the fold).
      await settle(page);
      const file = `${String(++n).padStart(2, '0')}-${slug(name)}.${EXT}`;
      await page.screenshot(shotOpts(join(dir, file)));
      manifest.push({ theme, width, name, file: `${theme}-${width}/${file}`, overlay: true });
    }
    for (let i = 0; i < 2; i++) await page.keyboard.press('Escape');
    // Back from a job's page (or the tab-less Templates page) to the Pipeline list (re-clicking the
    // selected Pipeline tab won't leave a job's page).
    await page.evaluate(() => {
      if (/^#\/(queue\/.|copy-deck)/.test(location.hash)) location.hash = '#/queue';
    });
    await page.waitForTimeout(200);
  }
  await ctx.close();
  return errors;
}

const { url: entry, stop } = await serve();
const url = entry.includes('://localhost') ? entry + '/' : entry;
const browser = await chromium.launch({
  // Cloud sessions ship a pre-installed Chromium; use it when PW_CHROMIUM_PATH isn't set.
  executablePath:
    process.env.PW_CHROMIUM_PATH || (existsSync(CLOUD_CHROMIUM) ? CLOUD_CHROMIUM : undefined),
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
    { label: LABEL, url: url.split('?')[0], at: new Date().toISOString(), shots: manifest, errors },
    null,
    2,
  ),
);
console.log(`gallery: ${manifest.length} shots → ${OUT} (${errors.length} page errors)`);
