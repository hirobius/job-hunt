// Every route of the app with the sample pipeline and a starter track loaded, for the guardrail
// specs (layout-rules, visual). Mirrors a11y.spec.ts's list, plus a job's Apply view.
import { expect, type Page } from '@playwright/test';

export const ROUTES = [
  '#/find',
  '#/apply',
  '#/copy-deck',
  '#/copy-deck/tpl-outreach',
  '#/legal/privacy',
  '#/legal/terms',
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
  // One job on a company board, so the Jobs panel's liveness row ("Check which are still
  // open") is in every Pipeline shot (QA). External requests are refused, so it never says closed.
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
  await expect(page.getByRole('region', { name: /^Review new/ })).toBeVisible();
}

/** Add the starter messages from Documents' empty state (a first run adds none). */
export async function addStarters(page: Page) {
  await go(page, '#/copy-deck');
  await page.getByRole('button', { name: 'Add starter messages' }).click();
  await expect(page.getByRole('region', { name: 'Outreach messages' })).toBeVisible();
}

export async function go(page: Page, hash: string) {
  await page.evaluate((h) => (location.hash = h), hash);
  await page.waitForTimeout(500);
}

/** A job's Apply view gets its id from the sample data, so it is reached by click. */
export async function openJob(page: Page) {
  await go(page, '#/apply');
  await page.locator('a[href^="#/apply/"]').first().click();
  await page.waitForTimeout(500);
}

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
