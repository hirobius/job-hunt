import { test, expect, type Locator, type Page } from '@playwright/test';
import { go, openApply, seed } from './routes';

// Return paths (Adrian 2026-10-22): "whenever someone navigates away with a key action, they should
// be able to get back easily enough / automatically." With the sample pipeline, Today behind it,
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
// The Pipeline page runs up to lg (800 stands for a tablet); from lg the Jobs tab is the list
// beside a job (#471), walked in "return paths at 1440" at the end.
for (const width of [390, 800] as const) {
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
      await go(page, '#/apply');
      await showAll(page);
      await atBottom(page);
      await page.waitForTimeout(400);
      const before = await scrollY(page);
      expect(before).toBeGreaterThan(300);
      const link = jobsPanel(page).locator('a[href^="#/apply/"]').last();
      const title = (await link.textContent())!.trim();
      await link.click();
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
      await expect.poll(() => scrollY(page)).toBe(0);

      // The browser's Back: the list, its filter, the row in view.
      await page.goBack();
      await expect(page).toHaveURL(/#\/apply$/);
      await expectScroll(page, before);
      await expect(jobsPanel(page).getByRole('link', { name: title }).first()).toBeInViewport();

      // And the in-app way back: a pop, so the browser's Back doesn't reopen the job.
      await jobsPanel(page).locator('a[href^="#/apply/"]').last().click();
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
      if (phone) {
        await page.getByRole('button', { name: 'Back to Apply' }).click();
        await expect(page).toHaveURL(/#\/apply$/);
        await expectScroll(page, before);
      } else {
        // At 1440 the rail stands in for Back: Change filters lands on the Jobs panel.
        await page.getByRole('navigation', { name: 'Jobs' }).getByText('Change filters').click();
        await expect(page).toHaveURL(/#\/apply$/);
        await expect(page.getByRole('button', { name: /^Status:/ })).toBeInViewport();
      }
      await page.goBack();
      await expect(page).not.toHaveURL(/#\/apply\//);
    });

    test('a job that leaves the list on the way (Mark applied): Back lands at the list end at once, and a scroll then starts there', async ({
      page,
    }) => {
      // The default Active filter: Mark applied takes the job out of the list, so the page comes
      // back one row shorter and never grows back to where it was.
      await go(page, '#/apply');
      await atBottom(page);
      await page.waitForTimeout(400);
      const before = await scrollY(page);
      expect(before).toBeGreaterThan(300);
      const last = jobsPanel(page).locator('a[href^="#/apply/"]').last();
      const title = (await last.textContent())!.trim();
      await last.click();
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
      await page.getByRole('button', { name: 'Mark applied' }).first().click();
      await page.goBack();
      await expect(page).toHaveURL(/#\/apply$/);
      await page.waitForTimeout(500);
      const y = await scrollY(page);
      expect(y).toBeGreaterThan(before - 400);
      // The user scrolls right away: from there, not from the top.
      await page.mouse.move(width / 2, 400);
      await page.mouse.wheel(0, -50);
      await page.waitForTimeout(600);
      expect(await scrollY(page)).toBeGreaterThan(before - 450);
    });

    test('a job and its Company page each name the other on their Back', async ({ page }) => {
      // A job opened from the Company page goes back to the Company, at every width.
      await go(page, '#/apply/company/larkspur-analytics');
      const row = page.getByRole('list', { name: /^Jobs at / }).locator('a[href^="#/apply/"]');
      const title = (await row.first().textContent())!.trim();
      await row.first().click();
      await page.getByRole('button', { name: 'Back to Larkspur Analytics' }).click();
      await expect(page).toHaveURL(/#\/apply\/company\/larkspur-analytics$/);

      // The Company page opened from the job (scrolled down to its Details) goes back to it, there.
      await go(page, '#/apply');
      await jobsPanel(page).getByRole('link', { name: title }).first().click();
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

    test("a job's pager moves in place, Back leaves in one step; Documents names the job", async ({
      page,
    }) => {
      await go(page, '#/apply');
      await scrollTo(page, 120);
      const before = await scrollY(page);
      await jobsPanel(page).locator('a[href^="#/apply/"]').first().click();
      const pager = page.getByRole('navigation', { name: 'Jobs in the list' });
      await expect(pager.getByText(/^1 of \d+$/)).toBeVisible();
      const of = (await pager.getByText(/^1 of \d+$/).textContent())!.replace('1 of ', '');
      await pager.getByRole('button', { name: 'Next page' }).click();
      await expect(pager.getByText(`2 of ${of}`)).toBeVisible();
      // In place: one Back leaves the job for the list, at the scroll it had.
      await page.goBack();
      await expect(page).toHaveURL(/#\/apply$/);
      await expectScroll(page, before);
      await jobsPanel(page).locator('a[href^="#/apply/"]').nth(1).click();
      await expect(pager.getByText(`2 of ${of}`)).toBeVisible();

      // Edit documents: Documents names the job, and Back returns to it.
      const job = (await page.getByRole('heading', { level: 1 }).first().textContent())!.trim();
      await page.getByRole('link', { name: /^(Edit documents|Write a message)$/ }).click();
      await page.getByRole('link', { name: `Back to ${job}` }).click();
      await expect(page).toHaveURL(/#\/apply\//);
      await expect(pager.getByText(`2 of ${of}`)).toBeVisible();
      await expect(page.getByRole('heading', { level: 1, name: job })).toBeVisible();
    });

    test('the browser Back closes a sheet and keeps the page under it', async ({ page }) => {
      // Every sheet opens over a page with another page behind it, so leaving would have
      // somewhere to go (the review walk: Today behind the Pipeline).
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
      await page.getByRole('button', { name: 'Add job' }).click();
      await page.getByLabel('Job link').fill('https://example.com/jobs/typed');
      await closesOnBack(page.getByRole('dialog'), queue);
      await expect(page.getByRole('heading', { level: 1, name: 'Apply' })).toBeVisible();

      // Sign in, picked from the Account menu (whose own entry is popped as it closes), typed in.
      await page.getByRole('button', { name: /^Account/ }).click();
      await page.getByRole('menuitem', { name: 'Sign in to sync…' }).click();
      const signIn = page.getByRole('dialog', { name: 'Sign in' });
      await signIn.getByLabel('Email').fill('typed@example.com');
      await closesOnBack(signIn, queue);

      // A row's menu, the Status filter, and Recently removed.
      const firstTitle = (await jobsPanel(page)
        .locator('a[href^="#/apply/"]')
        .first()
        .textContent())!.trim();
      await page
        .getByRole('button', { name: `More actions: ${firstTitle}` })
        .first()
        .click();
      await closesOnBack(page.getByRole('menu'), queue);
      await page.getByRole('button', { name: /^Status:/ }).click();
      await closesOnBack(page.getByRole('menu'), queue);
      await page
        .getByRole('button', { name: `More actions: ${firstTitle}` })
        .first()
        .click();
      await page.getByRole('menuitem', { name: 'Remove' }).click();
      // Recently removed is in the Account menu (#416).
      await page.getByRole('button', { name: /^Account/ }).click();
      await page.getByRole('menuitem', { name: /^Recently removed/ }).click();
      await closesOnBack(page.getByRole('dialog', { name: 'Recently removed' }), queue);

      // The Search profile, from the Account menu (#388).
      await page.getByRole('button', { name: /^Account/ }).click();
      await page.getByRole('menuitem', { name: 'Search profile' }).click();
      await closesOnBack(page.getByRole('dialog', { name: 'Search profile' }), queue);
    });

    // Review blockers (2026-10-22): Remove, Delete and double clicks each navigated twice, landing
    // one page too far back. Every case starts with a page in history before the origin, so a
    // second pop would have somewhere to go.
    test('Remove goes back once: to the Company page, to the row on the Pipeline; the Pipeline tab then opens the list', async ({
      page,
    }) => {
      const removeOpenJob = async (title: string) => {
        await page
          .getByRole('button', { name: `More actions: ${title}` })
          .first()
          .click();
        await page.getByRole('menuitem', { name: 'Remove' }).click();
      };
      // Opened from its Company page, with the Pipeline behind it.
      await go(page, '#/apply');
      await go(page, '#/apply/company/larkspur-analytics');
      const row = page.getByRole('list', { name: /^Jobs at / }).locator('a[href^="#/apply/"]');
      const title = (await row.first().textContent())!.trim();
      await row.first().click();
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
      await removeOpenJob(title);
      await expect(page).toHaveURL(/#\/apply\/company\/larkspur-analytics$/);
      await page.waitForTimeout(600);
      await expect(page).toHaveURL(/#\/apply\/company\/larkspur-analytics$/);

      // Opened from far down the Pipeline, with Today behind it: back at the row.
      await go(page, '#/find');
      await go(page, '#/apply');
      await showAll(page);
      await atBottom(page);
      await page.waitForTimeout(400);
      const before = await scrollY(page);
      expect(before).toBeGreaterThan(600);
      const last = jobsPanel(page).locator('a[href^="#/apply/"]').last();
      const lastTitle = (await last.textContent())!.trim();
      await last.click();
      await expect(page.getByRole('heading', { level: 1, name: lastTitle })).toBeVisible();
      await removeOpenJob(lastTitle);
      await expect(page).toHaveURL(/#\/apply$/);
      // One row shorter, so the page clamps a little, at once: never at the top while it waits.
      await page.waitForTimeout(800);
      expect(await scrollY(page)).toBeGreaterThan(before - 400);
      await expect(page).toHaveURL(/#\/apply$/);

      // Opened from Today (a save notice's Open names it), with another page behind it: Remove
      // lands on Today, and the Pipeline tab then opens the list, not the removed job.
      const next = jobsPanel(page).locator('a[href^="#/apply/"]').first();
      const id = (await next.getAttribute('href'))!.replace('#/apply/', '');
      const nextTitle = (await next.textContent())!.trim();
      await go(page, '#/copy-deck');
      await go(page, '#/find');
      await go(page, `#/apply/${id}?from=%2Ffind`);
      await expect(page.getByRole('heading', { level: 1, name: nextTitle })).toBeVisible();
      await removeOpenJob(nextTitle);
      await expect(page).toHaveURL(/#\/find$/);
      await page.waitForTimeout(600);
      await expect(page).toHaveURL(/#\/find$/);
      await page.getByRole('tab', { name: 'Apply' }).click();
      await expect(page).toHaveURL(/#\/apply$/);
      await expect(page.getByRole('heading', { level: 1, name: 'Apply' })).toBeVisible();
    });

    test('Delete in a document opened from the library goes back to the library, once', async ({
      page,
    }) => {
      await openApply(page);
      await page.getByRole('link', { name: /^(Edit documents|Write a message)$/ }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Documents' })).toBeVisible();
      const library = await page.evaluate(() => location.hash);
      const outreach = page.getByRole('region', { name: 'Outreach messages' });
      await outreach.locator('button[aria-expanded]').first().click();
      await outreach
        .getByRole('button', { name: /^Open / })
        .first()
        .click();
      await expect(page.getByRole('button', { name: 'All documents' })).toBeVisible();
      await page.getByRole('button', { name: 'More actions' }).last().click();
      // Soft (#329): no confirm, the document goes at once with Undo.
      await page.getByRole('menuitem', { name: 'Delete' }).click();
      await expect.poll(() => page.evaluate(() => location.hash)).toBe(library);
      await page.waitForTimeout(600);
      expect(await page.evaluate(() => location.hash)).toBe(library);
    });

    test('an unknown job or document goes back to the page that linked it, once', async ({
      page,
    }) => {
      // The dev server runs effects twice on mount (StrictMode): each fallback still goes back once.
      const hash = () => page.evaluate(() => location.hash);
      const cases: [string, string, string][] = [
        ['#/apply', '#/copy-deck/does-not-exist?from=%2Fapply', '#/apply'],
        ['#/find', '#/apply/nojob123?from=%2Ffind', '#/find'],
        ['#/apply', '#/apply/nojob123', '#/apply'],
      ];
      for (const [origin, unknown, lands] of cases) {
        // Another page behind the origin, so a second pop would have somewhere to go.
        await go(page, '#/copy-deck');
        await go(page, origin);
        await go(page, unknown);
        await expect.poll(hash).toBe(lands);
        await page.waitForTimeout(600);
        expect(await hash()).toBe(lands);
      }
    });

    test('a double click goes back once: the open tab, Back, Not a fit; a double Save saves once', async ({
      page,
    }) => {
      const hash = () => page.evaluate(() => location.hash);
      const stays = async (re: RegExp) => {
        await expect(page).toHaveURL(re);
        await page.waitForTimeout(600);
        await expect(page).toHaveURL(re);
      };
      // A job opened from the Pipeline, Today behind it: the open tab, tapped twice.
      await go(page, '#/find');
      await go(page, '#/apply');
      const link = jobsPanel(page).locator('a[href^="#/apply/"]').first();
      const title = (await link.textContent())!.trim();
      await link.click();
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
      await page.getByRole('tab', { name: 'Apply' }).dblclick();
      await stays(/#\/apply$/);
      if (phone) {
        // At lg the rail stands in for Back on a job opened from the list.
        await jobsPanel(page).locator('a[href^="#/apply/"]').first().click();
        await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
        await page.getByRole('button', { name: 'Back to Apply' }).dblclick();
        await stays(/#\/apply$/);
      }

      // A job's Apply view: a double Save in a new document from Edit documents saves one and
      // comes back. A job still to apply to (Saved), so Not a fit is there below.
      await go(page, '#/apply');
      await page.getByRole('button', { name: /^Status:/ }).click();
      await page.getByRole('menuitemradio', { name: /^Saved/ }).click();
      await jobsPanel(page).locator('a[href^="#/apply/"]').first().click();
      await expect(page).toHaveURL(/#\/apply\//);
      const apply = await hash();
      await page.getByRole('link', { name: /^(Edit documents|Write a message)$/ }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Documents' })).toBeVisible();
      const count = () =>
        page.evaluate(() => JSON.parse(localStorage.getItem('rjb_documents') || '[]').length);
      const docs = await count();
      await page.getByRole('button', { name: 'New résumé' }).click();
      await page.getByRole('textbox', { name: 'Text' }).fill('Ten years of welding.');
      await page.getByRole('button', { name: 'Save', exact: true }).dblclick();
      await expect.poll(hash).toBe(apply);
      await page.waitForTimeout(600);
      expect(await hash()).toBe(apply);
      expect(await count()).toBe(docs + 1);

      // Not a fit, clicked twice: one job set aside, one move to the next job, in place.
      const setAside = () =>
        page.evaluate(
          () =>
            (
              JSON.parse(localStorage.getItem('rjb_shortlist') || '[]') as { archived?: boolean }[]
            ).filter((j) => j.archived).length,
        );
      const aside = await setAside();
      const steps = await page.evaluate(() => history.length);
      await page.getByRole('button', { name: /^Not a fit/ }).dblclick();
      await expect.poll(hash).not.toBe(apply);
      await page.waitForTimeout(600);
      expect(await setAside()).toBe(aside + 1);
      expect(await page.evaluate(() => history.length)).toBe(steps);
    });

    test('each top tab reopens where it was left', async ({ page }) => {
      await go(page, '#/find');
      await page.getByRole('tab', { name: 'Apply' }).click();
      const link = jobsPanel(page).locator('a[href^="#/apply/"]').first();
      const title = (await link.textContent())!.trim();
      await link.click();
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
      await page.getByRole('tab', { name: 'Find' }).click();
      await expect(page).toHaveURL(/#\/find$/);
      await page.getByRole('tab', { name: 'Apply' }).click();
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
      // The open tab, tapped again, goes to its root.
      await page.getByRole('tab', { name: 'Apply' }).click();
      await expect(page).toHaveURL(/#\/apply$/);
    });

    // Review blockers (2026-10-22): coming back must restore what the person was doing, not only
    // the page. Each walk changes the view, leaves with a key action, and comes back both ways.
    test("a job's Apply view: a half-typed kit field is still open with its text after Edit documents", async ({
      page,
    }) => {
      await openApply(page);
      await page.getByRole('button', { name: /^Fill in \d+ more/ }).click();
      const add = page.getByRole('button', { name: /^Add / }).first();
      const label = (await add.getAttribute('aria-label'))!.replace(/^Add /, '');
      await add.click();
      const field = page.getByRole('textbox', { name: label, exact: true });
      await field.fill('Half typ');
      await page.getByRole('link', { name: /^(Edit documents|Write a message)$/ }).click();
      await page.getByRole('link', { name: /^Back to / }).click();
      await expect(page).toHaveURL(/#\/apply\//);
      await expect(field).toHaveValue('Half typ');
      // And the browser's Back.
      await page.getByRole('link', { name: /^(Edit documents|Write a message)$/ }).click();
      await expect(page).toHaveURL(/#\/copy-deck/);
      await page.goBack();
      await expect(page).toHaveURL(/#\/apply\//);
      await expect(field).toHaveValue('Half typ');
    });
  });
}

// From lg (#471, Adrian 2026-11-05): the Jobs tab is the list beside the job. A pick in the list
// moves in place, so the browser's Back leaves the tab in one step; the tab reopens on the job.
test.describe('return paths at 1440', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  const rail = (page: Page) => page.getByRole('navigation', { name: 'Jobs' });
  const rows = (page: Page) => rail(page).locator('a[href^="#/apply/"]');

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
      const title = (await rows(page).nth(i).locator('.rjb-semibold').textContent())!.trim();
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
    await page.getByRole('tab', { name: 'Apply' }).click();
    const title = (await rows(page).nth(1).locator('.rjb-semibold').textContent())!.trim();
    await rows(page).nth(1).click();
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await page.getByRole('tab', { name: 'Find' }).click();
    await expect(page).toHaveURL(/#\/find$/);
    await page.getByRole('tab', { name: 'Apply' }).click();
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await page.getByRole('tab', { name: 'Apply' }).click();
    await expect(page).toHaveURL(/#\/apply$/);
    await expect(rail(page).locator('a[aria-current="page"]')).toHaveCount(1);
  });

  test('a job and its Company page each name the other on their Back', async ({ page }) => {
    await go(page, '#/apply');
    const row = rows(page).filter({ hasText: 'Larkspur Analytics' }).first();
    const title = (await row.locator('.rjb-semibold').textContent())!.trim();
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
