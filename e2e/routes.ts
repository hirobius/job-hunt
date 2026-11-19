// Every route of the app with the sample pipeline and a starter track loaded, for the guardrail
// specs (layout-rules, visual). Mirrors a11y.spec.ts's list, plus a job's Apply view.
import { expect, type Page } from './fixtures';

export const ROUTES = [
  '#/review',
  '#/apply',
  // Documents and Legal are dialogs over the open tab (#471 slice 4).
  '#/review?documents=',
  '#/review?documents=tpl-outreach',
  '#/review?legal=privacy',
  '#/review?legal=terms',
  // A Company's page (#230), named by a sample job's company.
  '#/apply/company/larkspur-analytics',
  // An unknown route shows Page not found, not Companies.
  '#/nope',
];

/** The production build's preview (playwright.config.ts), for specs that time the app. */
export const PROD_URL = 'http://localhost:4173';

/** A Greenhouse posting the seed adds on top of the sample data. */
export const BOARD_JOB = 'https://boards.greenhouse.io/acme/jobs/77';

/** Sample data (with its Sample track, from the first starter pack), landing on Today. */
export async function seed(page: Page) {
  await page.goto('/#/apply');
  await page.getByRole('button', { name: 'Try with sample data' }).click();
  // One job on a company board (a liveness-eligible job; the check runs on open, signed in, #602).
  // External requests are refused, so it never says closed.
  // The sample lands first (the tab becomes its first job, focus moves to the page head); a click
  // on Add job while that settles could be lost, so open the dialog until it shows. Below lg Add
  // job is the pager's.
  await expect(page.getByRole('button', { name: 'Try with sample data' })).toHaveCount(0);
  const add = page.getByRole('dialog', { name: 'Add a job' });
  await expect(async () => {
    if (!(await add.isVisible())) await openAddJob(page);
    await expect(add).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await add.getByLabel('Job link').fill(BOARD_JOB);
  await add.getByRole('button', { name: 'Add job' }).click();
  // A clean first run has no messages (Adrian 2026-10-22): add the starters, as a user would.
  await addStarters(page);
  // The sample adds a Sample track from the first starter pack: no setup needed.
  // Signed out, Review is its sign-in line (#755): no postings are read.
  await go(page, '#/review');
  await expect(page.getByText('Sign in to see new postings.')).toBeVisible();
}

/** Add the starter messages from Documents' empty state (a first run adds none). */
export async function addStarters(page: Page) {
  await go(page, '#/review?documents=');
  const docs = page.getByRole('dialog', { name: 'Documents' });
  await docs.getByRole('button', { name: 'Add starter messages' }).click();
  await expect(docs.getByRole('region', { name: 'Messages' })).toBeVisible();
  await docs.getByRole('button', { name: 'Close' }).click();
  await expect(docs).toBeHidden();
}

/** The page has settled: one h1 in main, no loading skeleton, and two frames painted (the view's
 *  enter motion has started and focus has moved). Replaces a fixed 500 ms wait (audit item 13). */
export async function settled(page: Page) {
  await expect(page.locator('main h1')).toHaveCount(1);
  await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0);
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
}

export async function go(page: Page, hash: string) {
  await page.evaluate((h) => (location.hash = h), hash);
  await settled(page);
}

/** A job's Apply view gets its id from the sample data, so it is reached by click. */
export async function openJob(page: Page) {
  await go(page, '#/apply');
  // Below lg the tab is already the first job (Proposal A); from lg the list column beside the job.
  if ((page.viewportSize()?.width ?? 0) >= 1024) {
    const scope = (await listScope(page)).getByRole('navigation', { name: 'Jobs' });
    await scope.locator(JOB_LINK).first().click();
    await expect(page).toHaveURL(/#\/apply\/(?!company\/)/);
  }
  await settled(page);
}

/** A link to a job's Apply view (not a Company page). */
export const JOB_LINK = 'a[href^="#/apply/"]:not([href^="#/apply/company/"])';

/** The first job in the Apply list, in its Apply view (#471: there is no Apply mode or Start
 *  applying any more; the tab is the walk). */
export async function openApply(page: Page) {
  await openJob(page);
  await expect(page.getByRole('button', { name: 'Try with sample data' })).toHaveCount(0);
}

/** Visit every route, then a job's Apply view, calling `check` on each. */
export async function visitAll(page: Page, check: (name: string) => Promise<void>) {
  for (const hash of ROUTES) {
    await go(page, hash);
    await check(hash);
  }
  await openJob(page);
  await check('job page');
}

/** The Apply list column beside the job, from lg only: below lg the Apply tab is one job with the
 *  view picker and the pager, and no list (the All jobs sheet went 2026-11-17). */
export async function listScope(page: Page) {
  if ((page.viewportSize()?.width ?? 0) < 1024)
    throw new Error('Below lg there is no list: use the view picker and the pager.');
  return page.locator('.job-rail');
}

/** Opens the Add job dialog: the list column's key from lg; below lg the job's More menu. */
export async function openAddJob(page: Page) {
  if ((page.viewportSize()?.width ?? 0) >= 1024) {
    await page.locator('.job-rail').getByRole('button', { name: 'Add job' }).click();
  } else {
    await page.getByRole('button', { name: /^More actions: / }).click();
    await page.getByRole('menuitem', { name: 'Add job' }).click();
  }
  const dialog = page.getByRole('dialog', { name: 'Add a job' });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Below lg (#542): the walk row's view picker, then its "All jobs" view. */
export async function pressAllJobs(page: Page) {
  await page.getByRole('button', { name: /^View: / }).click();
  await page.getByRole('menuitemradio', { name: /^All jobs/ }).click();
}

/** Below lg: the view picker's All jobs view, then the pager back to its first job (the open job
 *  can be anywhere in the list). */
export async function firstJob(page: Page) {
  await pressAllJobs(page);
  const prev = page.getByRole('button', { name: 'Previous page' });
  for (let i = 0; i < 60 && (await prev.isEnabled()); i++) {
    await prev.click();
    await page.waitForTimeout(100);
  }
}

/** Opens a job by its title on the Apply tab: from lg a click in the list column on its All jobs
 *  view; below lg the view picker's All jobs view, then the pager steps until the title shows. */
export async function openByTitle(page: Page, title: string) {
  const h1 = page.getByRole('heading', { level: 1, name: title });
  if ((page.viewportSize()?.width ?? 0) >= 1024) {
    await page
      .getByRole('group', { name: 'Views' })
      .getByRole('button', { name: /^All jobs \d/ })
      .click();
    await page
      .getByRole('navigation', { name: 'Jobs' })
      .locator('a[href^="#/apply/"]', { hasText: title })
      .first()
      .click();
  } else {
    await firstJob(page);
    const next = page.getByRole('button', { name: 'Next page' });
    for (let i = 0; i < 40 && !(await h1.isVisible()); i++) {
      await next.click();
      await page.waitForTimeout(150);
    }
  }
  await expect(h1).toBeVisible();
}

/** Turn the Search profile's Remote only off (every work mode), as a person would: Apply's list
 *  follows the profile's work mode (2026-11-13), and the first run's profile is remote only, which
 *  hides the sample's on-site and hybrid jobs. For specs that walk several Apply rows. */
export async function allWorkModes(page: Page) {
  await page.getByRole('button', { name: /^Account/ }).click();
  await page.getByRole('menuitem', { name: 'Search profile' }).click();
  const profile = page.getByRole('dialog', { name: 'Search profile' });
  const sw = profile.getByRole('switch', { name: 'Remote only' });
  await expect(sw).toBeVisible();
  if (await sw.isChecked()) await sw.click();
  await expect(sw).not.toBeChecked();
  await profile.getByRole('button', { name: 'Save' }).click();
  await expect(profile).toBeHidden();
}

/** Open the Account menu's Data dialog (#550) and return it. */
export async function openData(page: Page) {
  await page.getByRole('button', { name: /^Account/ }).click();
  await page.getByRole('menuitem', { name: 'Data', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Data' });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Open Scan details (#549: a closed row in the Account menu's Search profile); returns the dialog. */
export async function openScanDetails(page: Page) {
  await page.getByRole('button', { name: /^Account/ }).click();
  await page.getByRole('menuitem', { name: 'Search profile', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Search profile' });
  await dialog.getByRole('button', { name: 'Scan details' }).click();
  return dialog;
}

/** The shell's top tabs are links in a nav (top tabs PR): one by name, or the open one. The name is
 *  its label, then Review's count when it has one ("Review 12", 2026-11-13). */
export const topTab = (page: Page, name: string) =>
  page
    .getByRole('navigation', { name: 'Sections' })
    .getByRole('link', { name: new RegExp(`^${name}( \\d+\\+?)?$`) });
export const currentTab = (page: Page) =>
  page.getByRole('navigation', { name: 'Sections' }).locator('a[aria-current="page"]');

/** Pick an item in the Account menu ("Scan now", "Stop scan", "Search profile"). Review has no
 *  More menu since #694: Scan now (signed out) sits in the Account menu beside Search profile. */
export async function accountMenuItem(page: Page, name: string) {
  await page.getByRole('button', { name: /^Account/ }).click();
  await page.getByRole('menuitem', { name, exact: true }).click();
}

/** Wait until every finite animation on the page has ended. A spec that measures where a menu or a
 *  dialog sits calls it first: an overlay enters with motion (late.css `rjb-overlay-in`, a phone's
 *  sheets slide), so its box moves for its first 150 ms. */
export async function settled(page: Page) {
  await page.evaluate(async () => {
    for (let i = 0; i < 10; i++) {
      const running = document
        .getAnimations()
        .filter(
          (a) => a.playState === 'running' && a.effect?.getComputedTiming().endTime !== Infinity,
        );
      if (!running.length) return;
      await Promise.all(running.map((a) => a.finished.catch(() => {})));
    }
  });
}
