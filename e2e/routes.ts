// Every route of the app with the sample pipeline and a starter track loaded, for the guardrail
// specs (layout-rules, visual). Mirrors a11y.spec.ts's list, plus the job page and Apply mode.
import { expect, type Page } from '@playwright/test';

export const ROUTES = [
  '#/today',
  '#/queue',
  '#/copy-deck',
  '#/copy-deck/tpl-outreach',
  '#/legal/privacy',
  '#/legal/terms',
  // A Company's page (#230), named by a sample job's company.
  '#/company/larkspur-analytics',
  // An unknown route shows Page not found, not Companies.
  '#/nope',
];

/** A Greenhouse posting the seed adds on top of the sample data. */
export const BOARD_JOB = 'https://boards.greenhouse.io/acme/jobs/77';

/** Sample data (with its Sample track, from the first starter pack), landing on Today. */
export async function seed(page: Page) {
  await page.goto('/#/queue');
  await page.getByRole('button', { name: 'Try with sample data' }).click();
  // One job on a company board, so the Jobs panel's liveness row ("Check which are still
  // open") is in every Pipeline shot (QA). External requests are refused, so it never says closed.
  await page.getByRole('button', { name: 'Add job' }).click();
  const add = page.getByRole('dialog', { name: 'Add a job' });
  await add.getByLabel('Job link').fill(BOARD_JOB);
  await add.getByRole('button', { name: 'Add job' }).click();
  // A clean first run has no messages (Adrian 2026-10-22): add the starters, as a user would.
  await addStarters(page);
  // The sample adds a Sample track from the first starter pack: no setup needed.
  await go(page, '#/today');
  await expect(page.getByRole('region', { name: /^Review new/ })).toBeVisible();
}

/** The old Companies screens (legacyScreens.ts), for the specs that still drive them until #389
 *  deletes them. Call before the first page.goto. */
export async function withLegacyScreens(page: Page) {
  await page.addInitScript(() => {
    (window as Window & { __RJB_LEGACY_SCREENS__?: boolean }).__RJB_LEGACY_SCREENS__ = true;
  });
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

/** The job page and Apply mode get their ids from the sample data, so they are reached by click. */
export async function openJob(page: Page) {
  await go(page, '#/queue');
  await page.locator('a[href^="#/queue/"]').first().click();
  await page.waitForTimeout(500);
}

export async function openApply(page: Page) {
  await go(page, '#/queue');
  await page.getByRole('button', { name: 'Start applying' }).click();
  await expect(page).toHaveURL(/#\/apply\//);
  await page.waitForTimeout(500);
}

/** Visit every route, then the job page and Apply mode, calling `check` on each. */
export async function visitAll(page: Page, check: (name: string) => Promise<void>) {
  for (const hash of ROUTES) {
    await go(page, hash);
    await check(hash);
  }
  await openJob(page);
  await check('job page');
  await openApply(page);
  await check('apply mode');
}
