// Every route of the app with the sample pipeline and a starter track loaded, for the guardrail
// specs (layout-rules, visual). Mirrors a11y.spec.ts's list, plus a job's Apply view.
import { expect, type Page } from '@playwright/test';

export const ROUTES = [
  '#/find',
  '#/apply',
  // Documents and Legal are dialogs over the open tab (#471 slice 4).
  '#/find?documents=',
  '#/find?documents=tpl-outreach',
  '#/find?legal=privacy',
  '#/find?legal=terms',
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
  // The sample lands first (its notice, then focus moves to the page head); a click on Add job
  // while that settles could be lost, so open the dialog until it shows.
  await expect(page.getByRole('status', { name: 'Sample data' })).toBeVisible();
  const add = page.getByRole('dialog', { name: 'Add a job' });
  await expect(async () => {
    if (!(await add.isVisible())) await page.getByRole('button', { name: 'Add job' }).click();
    await expect(add).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await add.getByLabel('Job link').fill(BOARD_JOB);
  await add.getByRole('button', { name: 'Add job' }).click();
  // A clean first run has no messages (Adrian 2026-10-22): add the starters, as a user would.
  await addStarters(page);
  // The sample adds a Sample track from the first starter pack: no setup needed.
  await go(page, '#/find');
  await expect(page.getByRole('region', { name: /^Review\b/ })).toBeVisible();
}

/** Add the starter messages from Documents' empty state (a first run adds none). */
export async function addStarters(page: Page) {
  await go(page, '#/find?documents=');
  const docs = page.getByRole('dialog', { name: 'Documents' });
  await docs.getByRole('button', { name: 'Add starter messages' }).click();
  await expect(docs.getByRole('region', { name: 'Messages' })).toBeVisible();
  await docs.getByRole('button', { name: 'Close' }).click();
  await expect(docs).toBeHidden();
}

export async function go(page: Page, hash: string) {
  await page.evaluate((h) => (location.hash = h), hash);
  await page.waitForTimeout(500);
}

/** A job's Apply view gets its id from the sample data, so it is reached by click. */
export async function openJob(page: Page) {
  await go(page, '#/apply');
  // Below lg the list is the All jobs sheet (Proposal A); from lg the list column beside the job.
  const scope =
    (page.viewportSize()?.width ?? 0) < 1024
      ? (await openAllJobs(page)).getByRole('region', { name: /^Jobs/ })
      : page.getByRole('navigation', { name: 'Jobs' });
  await scope.locator(JOB_LINK).first().click();
  await expect(page.getByRole('dialog', { name: 'All jobs' })).toHaveCount(0);
  await page.waitForTimeout(500);
}

/** A link to a job's Apply view (not a Company page). */
export const JOB_LINK = 'a[href^="#/apply/"]:not([href^="#/apply/company/"])';

/** The first job in the Apply list, in its Apply view (#471: there is no Apply mode or Start
 *  applying any more; the tab is the walk). */
export async function openApply(page: Page) {
  await openJob(page);
  await expect(page).toHaveURL(/#\/apply\//);
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

/** Below lg the Apply tab is one job (Proposal A, Adrian 2026-11-08); its list is the All jobs
 *  sheet. Opens it and returns it. */
export async function openAllJobs(page: Page) {
  await pressAllJobs(page);
  const sheet = page.getByRole('dialog', { name: 'All jobs' });
  await expect(sheet.getByRole('region', { name: /^Jobs/ })).toBeVisible();
  return sheet;
}

/** Below lg (#542): the walk row's view picker, then its "All jobs and filters" row. */
export async function pressAllJobs(page: Page) {
  await page.getByRole('button', { name: /^View: / }).click();
  await page.getByRole('menuitem', { name: 'All jobs and filters' }).click();
}

/** Below lg: open the Apply filter bar (search, Sort). */
export async function openFilters(page: Page) {
  const filters = page.getByRole('button', { name: 'Filters' });
  if ((await filters.getAttribute('aria-expanded')) !== 'true') await filters.click();
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

/** The shell's top tabs are links in a nav (top tabs PR): one by name, or the open one. */
export const topTab = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name, exact: true });
export const currentTab = (page: Page) =>
  page.getByRole('navigation', { name: 'Sections' }).locator('a[aria-current="page"]');

/** Find's one More menu (#544): Sort, Scan now (signed out; Stop scan while it runs) and Search
 *  profile. */
export const findMore = (page: Page) =>
  page.getByRole('button', { name: 'More: sort, scan and search profile' });

/** Pick an item in Find's More menu ("Scan now", "Stop scan", "Search profile"). */
export async function findMenuItem(page: Page, name: string) {
  await findMore(page).click();
  await page.getByRole('menuitem', { name, exact: true }).click();
}
