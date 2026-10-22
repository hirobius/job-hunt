import { test, expect, type Locator, type Page } from '@playwright/test';

// Adrian 2026-10-22: "Anywhere a job is listed, we should be able to click on the URL to visit the
// link, or there should be a visit jump link button near the URL or name of the job." With the
// sample pipeline loaded, every job the Pipeline lists (its panels, the table at 1440, the cards
// at 390) and every job page header carries a one-tap link to that job's own posting, beside its
// title, opening a new tab; on a phone it is a 40px target.

type SavedJob = { url: string; label: string };

/** The saved jobs, as the store persists them (src/store.ts, `rjb_shortlist`). */
const savedJobs = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('rjb_shortlist') || '[]') as SavedJob[]);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const postingFor = (scope: Locator, title: string) =>
  scope.getByRole('link', { name: new RegExp(`^Open posting for ${escape(title)}( at |$)`) });

async function loadSample(page: Page) {
  // Nothing leaves the machine: the sample postings answer with a stub page.
  await page
    .context()
    .route(/^https?:\/\/(?!localhost)/, (r) =>
      r.fulfill({ status: 200, contentType: 'text/html', body: '<title>Posting</title>' }),
    );
  await page.goto('/#/queue');
  await page.getByRole('button', { name: 'Try with sample data' }).click();
  await expect(page.getByRole('region', { name: /^Jobs/ })).toBeVisible();
}

/** Each listed job's title link (to its page) sits beside a posting link to its own URL. */
async function expectPostingLinks(page: Page, rows: Locator, phone: boolean) {
  const jobs = await savedJobs(page);
  const count = await rows.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    const row = rows.nth(i);
    const title = (await row.locator('a[href^="#/queue/"]').first().textContent())!.trim();
    const job = jobs.find((j) => j.label === title);
    expect(job, `a saved job titled "${title}"`).toBeTruthy();
    const posting = postingFor(row, title);
    await expect(posting).toBeVisible();
    await expect(posting).toHaveAttribute('href', job!.url);
    await expect(posting).toHaveAttribute('target', '_blank');
    if (phone) {
      const box = (await posting.boundingBox())!;
      expect(box.width, `${title}: 40px wide`).toBeGreaterThanOrEqual(39.5);
      expect(box.height, `${title}: 40px tall`).toBeGreaterThanOrEqual(39.5);
    }
  }
}

for (const width of [390, 1440] as const) {
  test.describe(`posting links at ${width}`, () => {
    test.use({ viewport: { width, height: 900 } });
    const phone = width < 640;

    test('every job the Pipeline lists opens its posting in one tap', async ({ page }) => {
      await loadSample(page);
      // The Jobs panel: phone cards, or the desktop table's rows.
      const jobRows = phone
        ? page.getByRole('region', { name: /^Jobs/ }).getByRole('article')
        : page.getByRole('table', { name: 'Saved jobs' }).locator('[role="row"]:has(a)');
      await expectPostingLinks(page, jobRows, phone);
      // The agenda panels above it.
      await expectPostingLinks(
        page,
        page.getByRole('region', { name: /^Follow up \(/ }).getByRole('listitem'),
        phone,
      );
      // An event row's title is plain text ("Interview · <job>"); its posting link sits beside it.
      const jobs = await savedJobs(page);
      const events = page.getByRole('region', { name: /^Next 7 days/ }).getByRole('listitem');
      expect(await events.count()).toBeGreaterThan(0);
      for (const event of await events.all()) {
        const posting = event.getByRole('link', { name: /^Open posting for / });
        expect(jobs.map((j) => j.url)).toContain(await posting.getAttribute('href'));
      }
    });

    test('every job page header opens its posting; the link opens a new tab', async ({ page }) => {
      await loadSample(page);
      const jobs = await savedJobs(page);
      const pages = await page
        .getByRole('region', { name: /^Jobs/ })
        .locator('a[href^="#/queue/"]')
        .evaluateAll((as) => as.map((a) => [a.getAttribute('href')!, a.textContent!.trim()]));
      expect(pages.length).toBeGreaterThan(0);
      let header: Locator | null = null;
      for (const [hash, title] of pages) {
        await page.evaluate((h) => (location.hash = h), hash);
        const heading = page.getByRole('heading', { level: 2, name: title, exact: true });
        await expect(heading).toBeVisible();
        header = page.locator('header').filter({ has: heading });
        const job = jobs.find((j) => j.label === title)!;
        const posting = postingFor(header, title);
        await expect(posting).toHaveAttribute('href', job.url);
        if (phone) {
          const box = (await posting.boundingBox())!;
          expect(Math.min(box.width, box.height), `${title}: 40px`).toBeGreaterThanOrEqual(39.5);
        }
      }
      // One tap: a new tab on the posting, and the app stays on the job's page.
      const posting = header!.getByRole('link', { name: /^Open posting for / });
      const href = (await posting.getAttribute('href'))!;
      const [tab] = await Promise.all([page.context().waitForEvent('page'), posting.click()]);
      await tab.waitForLoadState();
      expect(tab.url()).toBe(href);
      expect(page.url()).toContain('#/queue/');
    });
  });
}
