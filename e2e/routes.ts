// Every route of the app with the sample pipeline and a starter track loaded, for the guardrail
// specs (layout-rules, visual). Mirrors a11y.spec.ts's list, plus the job page and Apply mode.
import { expect, type Page } from '@playwright/test';

export const ROUTES = [
  '#/queue',
  '#/discover',
  '#/discover/apply',
  '#/discover/ats',
  '#/discover/live',
  '#/discover/boards',
  '#/discover/teams',
  '#/copy-deck',
  '#/copy-deck/tpl-outreach',
  '#/legal/privacy',
  '#/legal/terms',
  // A Company's page (#230), named by a sample job's company.
  '#/company/larkspur-analytics',
];

/** A Greenhouse posting the seed adds on top of the sample data. */
export const BOARD_JOB = 'https://boards.greenhouse.io/acme/jobs/77';

/** Sample data + the first starter track, landing on Apply now. */
export async function seed(page: Page) {
  await page.goto('/#/queue');
  await page.getByRole('button', { name: 'Try with sample data' }).click();
  // One job on a company board, so the Jobs panel's liveness row ("Check which are still
  // open") is in every Pipeline shot (QA). External requests are refused, so it never says closed.
  await page.getByRole('button', { name: 'Add job' }).click();
  const add = page.getByRole('dialog', { name: 'Add a job' });
  await add.getByLabel('Job link').fill(BOARD_JOB);
  await add.getByRole('button', { name: 'Add job' }).click();
  await page.getByRole('tab', { name: 'Companies' }).click();
  await page.getByRole('button', { name: 'Choose a track' }).click();
  // The Suggested (first) pack starts ticked (rev-3); keep it as the one track.
  await expect(
    page.getByRole('group', { name: 'Starter tracks' }).getByRole('checkbox').first(),
  ).toBeChecked();
  for (const name of ['Continue', 'Continue', 'Finish'])
    await page.getByRole('button', { name, exact: true }).click();
  await go(page, '#/discover/apply');
  await expect(page.getByRole('region', { name: 'Your sections' })).toBeVisible();
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
