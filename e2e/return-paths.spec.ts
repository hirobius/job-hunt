import { test, expect, type Locator, type Page } from '@playwright/test';
import { go, seed } from './routes';

// Return paths (Adrian 2026-10-22): "whenever someone navigates away with a key action, they should
// be able to get back easily enough / automatically." With the sample pipeline and a starter track,
// at 390 and 1440: Back (in-app or the browser's) lands where the jump started, at the scroll it
// had, in one step; a page opened by a jump names where it came from; finishing the key action
// comes straight back; the browser's Back closes a sheet and stays on the page.

const scrollY = (page: Page) => page.evaluate(() => Math.round(window.scrollY));
const atBottom = (page: Page) =>
  page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
/** Scroll so `y` is the top of the viewport, and wait for it to settle. */
async function scrollTo(page: Page, y: number) {
  await page.evaluate((top) => window.scrollTo(0, top), y);
  await page.waitForTimeout(400);
}
/** Close enough: the restore lands on the pixel, rounding aside. */
async function expectScroll(page: Page, y: number) {
  await expect.poll(() => scrollY(page), { timeout: 4000 }).toBeGreaterThanOrEqual(y - 4);
  expect(Math.abs((await scrollY(page)) - y)).toBeLessThanOrEqual(4);
}
async function showAll(page: Page) {
  await page.getByRole('button', { name: /^Status:/ }).click();
  await page.getByRole('menuitemradio', { name: /^All/ }).click();
  await page.waitForTimeout(300);
}
const jobsPanel = (page: Page) => page.getByRole('region', { name: 'Jobs' });
/** Where an element's top sits in the viewport. */
const topOf = async (l: Locator) => Math.round((await l.boundingBox())!.y);
/** Wait until the page height has been still for a moment (async rows done loading). */
async function settled(page: Page) {
  let last = -1;
  for (let i = 0; i < 40; i++) {
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    if (h === last) return;
    last = h;
    await page.waitForTimeout(400);
  }
}

for (const width of [390, 1440] as const) {
  test.describe(`return paths at ${width}`, () => {
    test.use({ viewport: { width, height: 844 } });
    const phone = width < 1024;

    test.beforeEach(async ({ page }) => {
      await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
      await seed(page);
    });

    test('a job opened from far down the Pipeline comes back to that row, in one step', async ({
      page,
    }) => {
      await go(page, '#/queue');
      await showAll(page);
      await atBottom(page);
      await page.waitForTimeout(400);
      const before = await scrollY(page);
      expect(before).toBeGreaterThan(300);
      const link = jobsPanel(page).locator('a[href^="#/queue/"]').last();
      const title = (await link.textContent())!.trim();
      await link.click();
      await expect(page.getByRole('heading', { level: 2, name: title })).toBeVisible();
      await expect.poll(() => scrollY(page)).toBe(0);

      // The browser's Back: the list, its filter, the row in view.
      await page.goBack();
      await expect(page).toHaveURL(/#\/queue$/);
      await expectScroll(page, before);
      await expect(jobsPanel(page).getByRole('link', { name: title }).first()).toBeInViewport();

      // And the in-app way back: a pop, so the browser's Back doesn't reopen the job.
      await jobsPanel(page).locator('a[href^="#/queue/"]').last().click();
      await expect(page.getByRole('heading', { level: 2, name: title })).toBeVisible();
      if (phone) {
        await page.getByRole('button', { name: 'Back to Pipeline' }).click();
        await expect(page).toHaveURL(/#\/queue$/);
        await expectScroll(page, before);
      } else {
        // At 1440 the rail stands in for Back: Change filters lands on the Jobs panel.
        await page.getByRole('navigation', { name: 'Jobs' }).getByText('Change filters').click();
        await expect(page).toHaveURL(/#\/queue$/);
        await expect(page.getByRole('button', { name: /^Status:/ })).toBeInViewport();
      }
      await page.goBack();
      await expect(page).not.toHaveURL(/#\/queue\//);
    });

    test('a job and its Company page each name the other on their Back', async ({ page }) => {
      // A job opened from the Company page goes back to the Company, at every width.
      await go(page, '#/company/larkspur-analytics');
      const row = page.getByRole('list', { name: /^Jobs at / }).locator('a[href^="#/queue/"]');
      const title = (await row.first().textContent())!.trim();
      await row.first().click();
      await page.getByRole('button', { name: 'Back to Larkspur Analytics' }).click();
      await expect(page).toHaveURL(/#\/company\/larkspur-analytics$/);

      // The Company page opened from the job (scrolled down to its Details) goes back to it, there.
      await go(page, '#/queue');
      await jobsPanel(page).getByRole('link', { name: title }).first().click();
      const details = page.getByRole('region', { name: 'Details' });
      await details.scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      const before = await scrollY(page);
      await details.getByRole('link', { name: 'Larkspur Analytics' }).click();
      await expect(
        page.getByRole('heading', { level: 2, name: 'Larkspur Analytics' }),
      ).toBeVisible();
      await page.getByRole('link', { name: `Back to ${title}` }).click();
      await expect(page.getByRole('heading', { level: 2, name: title })).toBeVisible();
      await expectScroll(page, before);
    });

    test('Apply mode: the pager moves in place, Back leaves in one step, Start applying resumes', async ({
      page,
    }) => {
      await go(page, '#/queue');
      await scrollTo(page, 120);
      const before = await scrollY(page);
      await page.getByRole('button', { name: 'Start applying' }).click();
      const pager = page.getByRole('navigation', { name: 'Jobs to apply' });
      await expect(pager.getByText(/^1 of \d+$/)).toBeVisible();
      const of = (await pager.getByText(/^1 of \d+$/).textContent())!.replace('1 of ', '');
      await pager.getByRole('button', { name: 'Next page' }).click();
      await expect(pager.getByText(`2 of ${of}`)).toBeVisible();
      await page.goBack();
      await expect(page).toHaveURL(/#\/queue$/);
      await expectScroll(page, before);
      await page.getByRole('button', { name: `Resume applying (2 of ${of})` }).click();
      await expect(pager.getByText(`2 of ${of}`)).toBeVisible();

      // Edit documents: Documents names Apply mode, and Back returns to the same job.
      const job = (await page.getByRole('heading', { level: 2 }).first().textContent())!.trim();
      await page.getByRole('link', { name: /^(Edit documents|Write a message)$/ }).click();
      await page.getByRole('link', { name: `Back to Apply mode (2 of ${of})` }).click();
      await expect(page).toHaveURL(/#\/apply\//);
      await expect(pager.getByText(`2 of ${of}`)).toBeVisible();
      await expect(page.getByRole('heading', { level: 2, name: job })).toBeVisible();
    });

    test('Use template → Edit message → Save comes back to the job with the sheet open', async ({
      page,
    }) => {
      await go(page, '#/queue');
      const link = jobsPanel(page).locator('a[href^="#/queue/"]').first();
      const title = (await link.textContent())!.trim();
      await link.click();
      await expect(page.getByRole('heading', { level: 2, name: title })).toBeVisible();
      await page.getByRole('button', { name: 'Use template' }).click();
      await page.getByRole('link', { name: 'Edit message' }).click();
      await expect(page).toHaveURL(/#\/copy-deck\//);
      await expect(page.getByRole('button', { name: `Back to ${title}` })).toBeVisible();
      const field = page.getByRole('textbox', { name: 'Message text' });
      await field.click();
      await page.keyboard.press('End');
      await page.keyboard.type(' Talk soon.');
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(page).toHaveURL(/#\/queue\//);
      await expect(page.getByRole('dialog', { name: 'Use a template' })).toBeVisible();
      await expect(page.getByRole('region', { name: 'Preview' })).toContainText('Talk soon.');
      // The browser's Back closes the sheet and stays on the job.
      await page.goBack();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page.getByRole('heading', { level: 2, name: title })).toBeVisible();
    });

    test('Live postings: Back to companies lands on the More ways panel again', async ({
      page,
    }) => {
      await go(page, '#/discover/teams');
      const more = page.getByRole('region', { name: 'More ways to find companies' });
      // The company rows read their boards on arrival: let them finish before measuring.
      await settled(page);
      await more.scrollIntoViewIfNeeded();
      await settled(page);
      const before = await topOf(more);
      await more.getByRole('link', { name: 'Open Live postings from job boards' }).click();
      await expect(page).toHaveURL(/#\/discover\/live$/);
      await page.getByRole('link', { name: 'Back to companies' }).click();
      await expect(page).toHaveURL(/#\/discover\/teams$/);
      // The panel is back where it was on screen, once the rows above it have loaded again.
      await expect.poll(() => topOf(more), { timeout: 6000 }).toBeGreaterThan(before - 6);
      await expect.poll(() => topOf(more), { timeout: 6000 }).toBeLessThan(before + 6);
      // A pop: the browser's Back leaves Companies instead of reopening Live postings.
      await page.goBack();
      await expect(page).not.toHaveURL(/#\/discover\/live$/);
    });

    test('the browser Back closes a sheet and keeps the page under it', async ({ page }) => {
      await go(page, '#/queue');
      await page.getByRole('button', { name: 'Add job' }).click();
      await page.getByLabel('Job link').fill('https://example.com/jobs/typed');
      await page.goBack();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page).toHaveURL(/#\/queue$/);
      await expect(page.getByRole('heading', { level: 2, name: 'Pipeline' })).toBeVisible();
    });

    test('each top tab reopens where it was left', async ({ page }) => {
      await go(page, '#/discover/ats');
      await page.getByRole('tab', { name: 'Pipeline' }).click();
      const link = jobsPanel(page).locator('a[href^="#/queue/"]').first();
      const title = (await link.textContent())!.trim();
      await link.click();
      await expect(page.getByRole('heading', { level: 2, name: title })).toBeVisible();
      await page.getByRole('tab', { name: 'Companies' }).click();
      await expect(page).toHaveURL(/#\/discover\/ats$/);
      await page.getByRole('tab', { name: 'Pipeline' }).click();
      await expect(page.getByRole('heading', { level: 2, name: title })).toBeVisible();
      // The open tab, tapped again, goes to its root.
      await page.getByRole('tab', { name: 'Pipeline' }).click();
      await expect(page).toHaveURL(/#\/queue$/);
    });
  });
}
