import { test, expect, type Locator, type Page } from '@playwright/test';
import {
  go,
  JOB_LINK,
  openAllJobs,
  openApply,
  openFilters,
  seed,
  topTab,
  openData,
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
      await go(page, '#/review');
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
      await expect(page).toHaveURL(/#\/review$/);
    });

    test('Mark applied moves on to the next job in place; Back leaves in one step', async ({
      page,
    }) => {
      await go(page, '#/review');
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
      await expect(page).toHaveURL(/#\/review$/);
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
      await go(page, '#/review');
      await go(page, '#/apply');
      const pager = page.getByRole('navigation', { name: 'Jobs in the list' });
      const at = await stepPager(page);

      // Edit documents: Documents opens over the job (#471 slice 4), and the browser's Back closes it.
      const job = (await h1(page).textContent())!.trim();
      await page.getByRole('link', { name: /^(Edit documents|Write a message)$/ }).click();
      await expect(page.getByRole('dialog', { name: 'Documents' })).toBeVisible();
      await page.goBack();
      await expect(page.getByRole('dialog', { name: 'Documents' })).toHaveCount(0);
      await expect(page).toHaveURL(/#\/apply\//);
      await expect(pager.getByText(at)).toBeVisible();
      await expect(page.getByRole('heading', { level: 1, name: job })).toBeVisible();
      // In place: one Back leaves the job for the page before the tab.
      await page.goBack();
      await expect(page).toHaveURL(/#\/review$/);
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
      await go(page, '#/review');
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

    // Review blockers (2026-10-22): Remove, Delete and double clicks each navigated twice, landing
    // one page too far back. Every case starts with a page in history before the origin, so a
    // second pop would have somewhere to go.
    test('Remove goes back once: to the Company page, to the Apply tab; the Apply tab then opens another job', async ({
      page,
    }) => {
      const removeOpenJob = async (title: string) => {
        await page
          .getByRole('button', { name: `More actions: ${title}` })
          .first()
          .click();
        await page.getByRole('menuitem', { name: 'Remove from Apply' }).click();
      };
      // Opened from its Company page, with Apply behind it.
      await go(page, '#/apply');
      await go(page, '#/apply/company/larkspur-analytics');
      const row = page.getByRole('list', { name: /^Jobs at / }).locator(JOB_LINK);
      const title = (await row.first().textContent())!.trim();
      await row.first().click();
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
      await removeOpenJob(title);
      await expect(page).toHaveURL(/#\/apply\/company\/larkspur-analytics$/);
      await page.waitForTimeout(600);
      await expect(page).toHaveURL(/#\/apply\/company\/larkspur-analytics$/);

      // Jumped to from All jobs, with Find behind it: Remove lands on the Apply tab, once.
      await go(page, '#/review');
      await go(page, '#/apply');
      const last = (await allJobs(page)).locator(JOB_LINK).last();
      const lastTitle = (await last.textContent())!.trim();
      await last.click();
      await expect(page.getByRole('heading', { level: 1, name: lastTitle })).toBeVisible();
      await removeOpenJob(lastTitle);
      await expect(page).toHaveURL(/#\/apply$/);
      await page.waitForTimeout(800);
      await expect(page).toHaveURL(/#\/apply$/);
      await expect(h1(page)).not.toHaveText(lastTitle);

      // Opened from Find (a save notice's Open names it), with another page behind it: Remove
      // lands on Find, and the Apply tab then opens another job, not the removed one.
      const next = (await allJobs(page)).locator(JOB_LINK).first();
      const id = (await next.getAttribute('href'))!.replace('#/apply/', '');
      const nextTitle = (await next.textContent())!.trim();
      await page.keyboard.press('Escape');
      await go(page, '#/review?documents=');
      await go(page, '#/review');
      await go(page, `#/apply/${id}?from=%2Ffind`);
      await expect(page.getByRole('heading', { level: 1, name: nextTitle })).toBeVisible();
      await removeOpenJob(nextTitle);
      await expect(page).toHaveURL(/#\/review$/);
      await page.waitForTimeout(600);
      await expect(page).toHaveURL(/#\/review$/);
      await topTab(page, 'Apply').click();
      await expect(page).toHaveURL(/#\/apply$/);
      await expect(h1(page)).toBeVisible();
      await expect(h1(page)).not.toHaveText(nextTitle);
    });

    test('Delete in a document opened from the library goes back to the library, once', async ({
      page,
    }) => {
      await openApply(page);
      await page.getByRole('link', { name: /^(Edit documents|Write a message)$/ }).click();
      await expect(page.getByRole('dialog', { name: 'Documents' })).toBeVisible();
      const library = await page.evaluate(() => location.hash);
      const outreach = page.getByRole('region', { name: 'Messages' });
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
        // A document is a dialog over the page (#471 slice 4): an unknown one shows the library.
        ['#/apply', '#/apply?documents=does-not-exist', '#/apply?documents='],
        ['#/review', '#/apply/nojob123?from=%2Ffind', '#/review'],
        ['#/apply', '#/apply/nojob123', '#/apply'],
      ];
      for (const [origin, unknown, lands] of cases) {
        // Another page behind the origin, so a second pop would have somewhere to go.
        await go(page, '#/review?documents=');
        await go(page, origin);
        await go(page, unknown);
        await expect.poll(hash).toBe(lands);
        await page.waitForTimeout(600);
        expect(await hash()).toBe(lands);
      }
    });

    test('a double click goes back once: the open tab, Not a fit; a double Save saves once', async ({
      page,
    }) => {
      const hash = () => page.evaluate(() => location.hash);
      const stays = async (re: RegExp) => {
        await expect(page).toHaveURL(re);
        await page.waitForTimeout(600);
        await expect(page).toHaveURL(re);
      };
      // A job jumped to from All jobs, Find behind it: the open tab, tapped twice.
      await go(page, '#/review');
      await go(page, '#/apply');
      const link = (await allJobs(page)).locator(JOB_LINK).nth(1);
      const title = (await link.textContent())!.trim();
      await link.click();
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
      await topTab(page, 'Apply').dblclick();
      await stays(/#\/apply$/);

      // A job still to apply to (Saved), so Not a fit is there: a double Save in a new document
      // from Edit documents saves one and comes back.
      // The To apply view (#541) holds only jobs still to apply to: the walk row's picker (#542).
      await page.getByRole('button', { name: /^View: / }).click();
      await page.getByRole('menuitemradio', { name: /^To apply/ }).click();
      await page
        .getByRole('navigation', { name: 'Jobs in the list' })
        .getByRole('button', { name: 'Next page' })
        .click();
      await expect(page).toHaveURL(/#\/apply\//);
      const apply = await hash();
      await page.getByRole('link', { name: /^(Edit documents|Write a message)$/ }).click();
      await expect(page.getByRole('dialog', { name: 'Documents' })).toBeVisible();
      const count = () =>
        page.evaluate(() => JSON.parse(localStorage.getItem('rjb_documents') || '[]').length);
      const docs = await count();
      // The library's one New key (#552): its menu, then the kind.
      await page.getByRole('button', { name: 'New document' }).click();
      await page.getByRole('menuitem', { name: 'Résumé' }).click();
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
      await go(page, '#/review');
      await topTab(page, 'Apply').click();
      await stepPager(page);
      const title = (await h1(page).textContent())!.trim();
      await topTab(page, 'Review').click();
      await expect(page).toHaveURL(/#\/review$/);
      await topTab(page, 'Apply').click();
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
      // The open tab, tapped again, goes to its root.
      await topTab(page, 'Apply').click();
      await expect(page).toHaveURL(/#\/apply$/);
    });

    // Review blockers (2026-10-22): coming back must restore what the person was doing, not only
    // the page. Each walk changes the view, leaves with a key action, and comes back both ways.
    test("a job's Apply view: a half-typed kit field is still open with its text after Edit documents", async ({
      page,
    }) => {
      await openApply(page);
      await page.getByRole('button', { name: 'Add them' }).click();
      const add = page
        .getByRole('region', { name: /^Copy into the form/ })
        .getByRole('button', { name: /^Add / })
        .first();
      const label = (await add.getAttribute('aria-label'))!.replace(/^Add /, '');
      await add.click();
      const field = page.getByRole('textbox', { name: label, exact: true });
      await field.fill('Half typ');
      await page.getByRole('link', { name: /^(Edit documents|Write a message)$/ }).click();
      await page
        .getByRole('dialog', { name: 'Documents' })
        .getByRole('button', { name: 'Close' })
        .click();
      await expect(page).toHaveURL(/#\/apply\/[^?]+$/);
      await expect(field).toHaveValue('Half typ');
      // And the browser's Back.
      await page.getByRole('link', { name: /^(Edit documents|Write a message)$/ }).click();
      await expect(page).toHaveURL(/documents=/);
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
  const rows = (page: Page) => rail(page).locator(JOB_LINK);

  test.beforeEach(async ({ page }) => {
    await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
    await seed(page);
  });

  test('picks in the list move in place: one Back leaves the Jobs tab', async ({ page }) => {
    await go(page, '#/review');
    await go(page, '#/apply');
    // It opens on the first job to apply to.
    await expect(rail(page).locator('a[aria-current="page"]')).toHaveCount(1);
    for (const i of [1, 2]) {
      const title = (await rows(page).nth(i).textContent())!.trim();
      await rows(page).nth(i).click();
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    }
    await page.goBack();
    await expect(page).toHaveURL(/#\/review$/);
  });

  test('the Jobs tab reopens on the job it was left on; tapped again, its first job to apply', async ({
    page,
  }) => {
    await go(page, '#/review');
    await topTab(page, 'Apply').click();
    const title = (await rows(page).nth(1).textContent())!.trim();
    await rows(page).nth(1).click();
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await topTab(page, 'Review').click();
    await expect(page).toHaveURL(/#\/review$/);
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
