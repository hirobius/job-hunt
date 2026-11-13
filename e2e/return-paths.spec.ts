import { test, expect, type Locator, type Page } from '@playwright/test';
import {
  go,
  JOB_LINK,
  openAllJobs,
  openFilters,
  seed,
  topTab,
  openData,
  accountMenuItem,
} from './routes';

// Return paths (Adrian 2026-10-22): "whenever someone navigates away with a key action, they should
// be able to get back easily enough / automatically." With the sample pipeline, Today behind it,
// at 390 and 1440: Back (in-app or the browser's) lands where the jump started, at the scroll it
// had, in one step; a page opened by a jump names where it came from; finishing the key action
// comes straight back; the browser's Back closes a sheet and stays on the page.

const scrollY = (page: Page) => page.evaluate(() => Math.round(window.scrollY));
/** Close enough: the restore lands on the pixel, rounding aside. */
async function expectScroll(page: Page, y: number) {
  await expect.poll(() => scrollY(page), { timeout: 4000 }).toBeGreaterThanOrEqual(y - 4);
  expect(Math.abs((await scrollY(page)) - y)).toBeLessThanOrEqual(4);
}
/** Below lg the Apply tab is one job (Proposal A, Adrian 2026-11-08): the All jobs sheet is its
 *  list. Opens it and returns its Jobs panel. */
/** The All jobs sheet's rows, on its All jobs view (the sheet lists one view, #543). */
async function allJobs(page: Page) {
  const sheet = await openAllJobs(page);
  await sheet.getByRole('button', { name: /^All jobs \d/ }).click();
  return sheet.getByRole('navigation', { name: 'Jobs' });
}
const h1 = (page: Page) => page.getByRole('heading', { level: 1 }).first();
/** Step the "‹ k of N ›" pager one job (on, else back from the last); returns the new "k of N". */
async function stepPager(page: Page) {
  const pager = page.getByRole('navigation', { name: 'Jobs in the list' });
  const now = (await pager.getByText(/^\d+ of \d+$/).textContent())!;
  const [k, n] = now.split(' of ').map(Number);
  const to = k < n ? k + 1 : k - 1;
  await pager.getByRole('button', { name: k < n ? 'Next page' : 'Previous page' }).click();
  await expect(pager.getByText(`${to} of ${n}`)).toBeVisible();
  return `${to} of ${n}`;
}
// Below lg (800 stands for a tablet) the Apply tab is one job with a pager and the All jobs sheet;
// from lg it is the list beside a job (#471), walked in "return paths at 1440" at the end.
for (const width of [390, 800] as const) {
  test.describe(`return paths at ${width}`, () => {
    test.use({ viewport: { width, height: 844 } });

    test.beforeEach(async ({ page }) => {
      await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
      await seed(page);
    });

    test('All jobs jumps to a job in place: one Back leaves the Apply tab', async ({ page }) => {
      await go(page, '#/find');
      await go(page, '#/apply');
      const jobs = await allJobs(page);
      const link = jobs.locator(JOB_LINK).last();
      const title = (await link.textContent())!.trim();
      await link.click();
      await expect(page.getByRole('dialog', { name: 'All jobs' })).toHaveCount(0);
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
      await expect(page).toHaveURL(/#\/apply\/[^/?]+$/);
      await expect.poll(() => scrollY(page)).toBe(0);
      await page.goBack();
      await expect(page).toHaveURL(/#\/find$/);
    });

    test('Mark applied moves on to the next job in place; Back leaves in one step', async ({
      page,
    }) => {
      await go(page, '#/find');
      await go(page, '#/apply');
      const first = (await h1(page).textContent())!.trim();
      const shown = page.url();
      await page
        .getByRole('button', { name: /^Mark applied/ })
        .first()
        .click();
      await expect.poll(() => page.url()).not.toBe(shown);
      await expect(h1(page)).not.toHaveText(first);
      await page.goBack();
      await expect(page).toHaveURL(/#\/find$/);
    });

    test('a job and its Company page each name the other on their Back', async ({ page }) => {
      // A job opened from the Company page goes back to the Company, at every width.
      await go(page, '#/apply/company/larkspur-analytics');
      const row = page.getByRole('list', { name: /^Jobs at / }).locator(JOB_LINK);
      const title = (await row.first().textContent())!.trim();
      await row.first().click();
      await page.getByRole('button', { name: 'Back to Larkspur Analytics' }).click();
      await expect(page).toHaveURL(/#\/apply\/company\/larkspur-analytics$/);

      // The Company page opened from the job (scrolled down to its Details) goes back to it, there.
      await go(page, '#/apply');
      await (await allJobs(page)).getByRole('link', { name: title }).first().click();
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
      const details = page.getByRole('region', { name: 'Details' });
      await details.scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      const before = await scrollY(page);
      await details.getByRole('link', { name: 'Larkspur Analytics' }).click();
      await expect(
        page.getByRole('heading', { level: 1, name: 'Larkspur Analytics' }),
      ).toBeVisible();
      await page.getByRole('link', { name: `Back to ${title}` }).click();
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
      await expectScroll(page, before);
    });

    test("a job's pager moves in place, Back leaves in one step; Documents opens over the job", async ({
      page,
    }) => {
      await go(page, '#/find');
      await go(page, '#/apply');
      const pager = page.getByRole('navigation', { name: 'Jobs in the list' });
      const at = await stepPager(page);

      // Documents (Account menu) opens over the job (#471 slice 4), and the browser's Back closes it.
      const job = (await h1(page).textContent())!.trim();
      await accountMenuItem(page, 'Documents');
      await expect(page.getByRole('dialog', { name: 'Documents' })).toBeVisible();
      await page.goBack();
      await expect(page.getByRole('dialog', { name: 'Documents' })).toHaveCount(0);
      await expect(page).toHaveURL(/#\/apply\//);
      await expect(pager.getByText(at)).toBeVisible();
      await expect(page.getByRole('heading', { level: 1, name: job })).toBeVisible();
      // In place: one Back leaves the job for the page before the tab.
      await page.goBack();
      await expect(page).toHaveURL(/#\/find$/);
    });

    test('the browser Back closes a sheet and keeps the page under it', async ({ page }) => {
      // Every sheet opens over a page with another page behind it, so leaving would have
      // somewhere to go.
      const closesOnBack = async (sheet: Locator, url: RegExp) => {
        await expect(sheet).toBeVisible();
        await page.goBack();
        await expect(sheet).toHaveCount(0);
        await expect(page).toHaveURL(url);
        await page.waitForTimeout(300);
        await expect(page).toHaveURL(url);
      };
      await go(page, '#/find');
      await go(page, '#/apply');
      const queue = /#\/apply$/;
      // Add job is the All jobs sheet's (#543): Back closes the dialog, then the sheet.
      const all = await openAllJobs(page);
      await all.getByRole('button', { name: 'Add job' }).click();
      await page.getByLabel('Job link').fill('https://example.com/jobs/typed');
      await closesOnBack(page.getByRole('dialog', { name: 'Add a job' }), queue);
      await closesOnBack(all, queue);

      // Sign in, picked from the Account menu (whose own entry is popped as it closes), typed in.
      await page.getByRole('button', { name: /^Account/ }).click();
      await page.getByRole('menuitem', { name: 'Sign in', exact: true }).click();
      const signIn = page.getByRole('dialog', { name: 'Sign in' });
      await signIn.getByLabel('Email').fill('typed@example.com');
      await closesOnBack(signIn, queue);

      // The view picker (#542), the All jobs sheet, the job's menu, the Sort menu, and Recently removed.
      await page.getByRole('button', { name: /^View: / }).click();
      await closesOnBack(page.getByRole('menu'), queue);
      await openAllJobs(page);
      await closesOnBack(page.getByRole('dialog', { name: 'All jobs' }), queue);
      const title = (await h1(page).textContent())!.trim();
      const more = page.getByRole('button', { name: `More actions: ${title}` }).first();
      await more.click();
      await closesOnBack(page.getByRole('menu'), queue);
      // Sort is the sheet's too (#543): Back closes its menu, then the sheet.
      const filters = await openFilters(page);
      await filters.getByRole('button', { name: /^Sort:/ }).click();
      await closesOnBack(page.getByRole('menu'), queue);
      await closesOnBack(filters, queue);
      await more.click();
      await page.getByRole('menuitem', { name: 'Remove from Apply' }).click();
      // Recently removed is in the Account menu's Data dialog (#416, #550).
      await (await openData(page)).getByRole('button', { name: /^Recently removed/ }).click();
      await closesOnBack(page.getByRole('dialog', { name: 'Recently removed' }), queue);

      // The Search profile, from the Account menu (#388).
      await page.getByRole('button', { name: /^Account/ }).click();
      await page.getByRole('menuitem', { name: 'Search profile' }).click();
      await closesOnBack(page.getByRole('dialog', { name: 'Search profile' }), queue);
    });
  });
}

// From lg (#471, Adrian 2026-11-05): the Jobs tab is the list beside the job. A pick in the list
// moves in place, so the browser's Back leaves the tab in one step; the tab reopens on the job.
test.describe('return paths at 1440', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  const rail = (page: Page) => page.getByRole('navigation', { name: 'Jobs' });
  const rows = (page: Page) => rail(page).locator(JOB_LINK);

  test.beforeEach(async ({ page }) => {
    await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
    await seed(page);
  });

  test('picks in the list move in place: one Back leaves the Jobs tab', async ({ page }) => {
    await go(page, '#/find');
    await go(page, '#/apply');
    // It opens on the first job to apply to.
    await expect(rail(page).locator('a[aria-current="page"]')).toHaveCount(1);
    for (const i of [1, 2]) {
      const title = (await rows(page).nth(i).textContent())!.trim();
      await rows(page).nth(i).click();
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    }
    await page.goBack();
    await expect(page).toHaveURL(/#\/find$/);
  });

  test('the Jobs tab reopens on the job it was left on; tapped again, its first job to apply', async ({
    page,
  }) => {
    await go(page, '#/find');
    await topTab(page, 'Apply').click();
    const title = (await rows(page).nth(1).textContent())!.trim();
    await rows(page).nth(1).click();
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await topTab(page, 'Find').click();
    await expect(page).toHaveURL(/#\/find$/);
    await topTab(page, 'Apply').click();
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await topTab(page, 'Apply').click();
    await expect(page).toHaveURL(/#\/apply$/);
    await expect(rail(page).locator('a[aria-current="page"]')).toHaveCount(1);
  });

  test('a job and its Company page each name the other on their Back', async ({ page }) => {
    await go(page, '#/apply');
    // The row's link holds the title; the company is on the row beside it (#543).
    const row = rail(page)
      .getByRole('listitem')
      .filter({ hasText: 'Larkspur Analytics' })
      .first()
      .locator(JOB_LINK);
    const title = (await row.textContent())!.trim();
    await row.click();
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await page
      .getByRole('region', { name: 'Details' })
      .getByRole('link', { name: 'Larkspur Analytics' })
      .click();
    await expect(page.getByRole('heading', { level: 1, name: 'Larkspur Analytics' })).toBeVisible();
    await page.getByRole('link', { name: `Back to ${title}` }).click();
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  });
});
