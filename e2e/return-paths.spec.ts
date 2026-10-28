import { test, expect, type Locator, type Page } from '@playwright/test';
import { go, openApply, openJob, seed } from './routes';

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

    test('a job that leaves the list on the way (Mark applied): Back lands at the list end at once, and a scroll then starts there', async ({
      page,
    }) => {
      // The default Active filter: Mark applied takes the job out of the list, so the page comes
      // back one row shorter and never grows back to where it was.
      await go(page, '#/queue');
      await atBottom(page);
      await page.waitForTimeout(400);
      const before = await scrollY(page);
      expect(before).toBeGreaterThan(300);
      const last = jobsPanel(page).locator('a[href^="#/queue/"]').last();
      const title = (await last.textContent())!.trim();
      await last.click();
      await expect(page.getByRole('heading', { level: 2, name: title })).toBeVisible();
      await page.getByRole('button', { name: 'Mark applied' }).first().click();
      await page.goBack();
      await expect(page).toHaveURL(/#\/queue$/);
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
      // The watched boards answer late (here: refused after a while), as a real board read
      // can: the rows reorder as each one answers, well after the way back has landed.
      await page.route(
        /^https?:\/\/(boards-api\.greenhouse\.io|api\.(eu\.)?lever\.co|api\.ashbyhq\.com)\//,
        async (r) => {
          await new Promise((done) => setTimeout(done, 900));
          await r.abort().catch(() => {});
        },
      );
      const checking = page.getByText(/checking open roles/);
      await go(page, '#/discover/teams');
      const more = page.getByRole('region', { name: 'More ways to find companies' });
      // The company rows read their boards on arrival: let them finish before measuring.
      await expect(checking).toHaveCount(0, { timeout: 20_000 });
      await settled(page);
      await more.scrollIntoViewIfNeeded();
      await settled(page);
      const before = await topOf(more);
      await more.getByRole('link', { name: 'Open Live postings from job boards' }).click();
      await expect(page).toHaveURL(/#\/discover\/live$/);
      await page.getByRole('link', { name: 'Back to companies' }).click();
      await expect(page).toHaveURL(/#\/discover\/teams$/);
      // The panel is back where it was on screen, once the rows above it have loaded again, and
      // stays there while the rows read their boards again and reorder as they answer.
      const holds = async () => {
        await expect.poll(() => topOf(more), { timeout: 6000 }).toBeGreaterThan(before - 6);
        await expect.poll(() => topOf(more), { timeout: 6000 }).toBeLessThan(before + 6);
        await expect(checking).toHaveCount(0, { timeout: 20_000 });
        await page.waitForTimeout(300);
        expect(Math.abs((await topOf(more)) - before)).toBeLessThan(6);
      };
      await holds();
      // Check a list, then the browser's Back: the same.
      await more.getByRole('link', { name: 'Open Check a list of companies' }).click();
      await expect(page).toHaveURL(/#\/discover\/boards$/);
      await page.goBack();
      await expect(page).toHaveURL(/#\/discover\/teams$/);
      await holds();
      // A pop: the browser's Back leaves Companies instead of reopening Live postings.
      await page.goBack();
      await expect(page).not.toHaveURL(/#\/discover\/live$/);
    });

    test('the browser Back closes a sheet and keeps the page under it', async ({ page }) => {
      // Every sheet opens over a page with another page behind it, so leaving would have
      // somewhere to go (the review walk: Companies behind the Pipeline).
      const closesOnBack = async (sheet: Locator, url: RegExp) => {
        await expect(sheet).toBeVisible();
        await page.goBack();
        await expect(sheet).toHaveCount(0);
        await expect(page).toHaveURL(url);
        await page.waitForTimeout(300);
        await expect(page).toHaveURL(url);
      };
      await go(page, '#/discover/apply');
      await go(page, '#/queue');
      const queue = /#\/queue$/;
      await page.getByRole('button', { name: 'Add job' }).click();
      await page.getByLabel('Job link').fill('https://example.com/jobs/typed');
      await closesOnBack(page.getByRole('dialog'), queue);
      await expect(page.getByRole('heading', { level: 2, name: 'Pipeline' })).toBeVisible();

      // Sign in, picked from the Account menu (whose own entry is popped as it closes), typed in.
      await page.getByRole('button', { name: /^Account/ }).click();
      await page.getByRole('menuitem', { name: 'Sign in to sync…' }).click();
      const signIn = page.getByRole('dialog', { name: 'Sign in' });
      await signIn.getByLabel('Email').fill('typed@example.com');
      await closesOnBack(signIn, queue);

      // A row's menu, the Status filter, and Recently removed.
      const firstTitle = (await jobsPanel(page)
        .locator('a[href^="#/queue/"]')
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
      await page.getByRole('button', { name: /^Recently removed/ }).click();
      await closesOnBack(page.getByRole('dialog', { name: 'Recently removed' }), queue);

      // Companies: where and how you want to work.
      await go(page, '#/discover/ats');
      await page.getByRole('button', { name: /^Change where:/ }).click();
      await closesOnBack(
        page.getByRole('dialog', { name: 'Where and how you want to work' }),
        /#\/discover\/ats$/,
      );
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
      await go(page, '#/queue');
      await go(page, '#/company/larkspur-analytics');
      const row = page.getByRole('list', { name: /^Jobs at / }).locator('a[href^="#/queue/"]');
      const title = (await row.first().textContent())!.trim();
      await row.first().click();
      await expect(page.getByRole('heading', { level: 2, name: title })).toBeVisible();
      await removeOpenJob(title);
      await expect(page).toHaveURL(/#\/company\/larkspur-analytics$/);
      await page.waitForTimeout(600);
      await expect(page).toHaveURL(/#\/company\/larkspur-analytics$/);

      // Opened from far down the Pipeline, with Companies behind it: back at the row.
      await go(page, '#/discover/ats');
      await go(page, '#/queue');
      await showAll(page);
      await atBottom(page);
      await page.waitForTimeout(400);
      const before = await scrollY(page);
      expect(before).toBeGreaterThan(600);
      const last = jobsPanel(page).locator('a[href^="#/queue/"]').last();
      const lastTitle = (await last.textContent())!.trim();
      await last.click();
      await expect(page.getByRole('heading', { level: 2, name: lastTitle })).toBeVisible();
      await removeOpenJob(lastTitle);
      await expect(page).toHaveURL(/#\/queue$/);
      // One row shorter, so the page clamps a little, at once: never at the top while it waits.
      await page.waitForTimeout(800);
      expect(await scrollY(page)).toBeGreaterThan(before - 400);
      await expect(page).toHaveURL(/#\/queue$/);

      // Opened from Companies (a save notice's Open names it), with another tool behind it: Remove
      // lands on Companies, and the Pipeline tab then opens the list, not the removed job.
      const next = jobsPanel(page).locator('a[href^="#/queue/"]').first();
      const id = (await next.getAttribute('href'))!.replace('#/queue/', '');
      const nextTitle = (await next.textContent())!.trim();
      await go(page, '#/discover/apply');
      await go(page, '#/discover/ats');
      await go(page, `#/queue/${id}?from=%2Fdiscover%2Fats`);
      await expect(page.getByRole('heading', { level: 2, name: nextTitle })).toBeVisible();
      await removeOpenJob(nextTitle);
      await expect(page).toHaveURL(/#\/discover\/ats$/);
      await page.waitForTimeout(600);
      await expect(page).toHaveURL(/#\/discover\/ats$/);
      await page.getByRole('tab', { name: 'Pipeline' }).click();
      await expect(page).toHaveURL(/#\/queue$/);
      await expect(page.getByRole('heading', { level: 2, name: 'Pipeline' })).toBeVisible();
    });

    test('Delete in a document opened from the library goes back to the library, once', async ({
      page,
    }) => {
      await openApply(page);
      await page.getByRole('link', { name: /^(Edit documents|Write a message)$/ }).click();
      await expect(page.getByRole('heading', { level: 2, name: 'Documents' })).toBeVisible();
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
        ['#/queue', '#/copy-deck/does-not-exist?from=%2Fqueue', '#/queue'],
        ['#/discover/ats', '#/queue/nojob123?from=%2Fdiscover%2Fats', '#/discover/ats'],
        ['#/queue', '#/queue/nojob123', '#/queue'],
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
      // A job opened from the Pipeline, Companies behind it: the open tab, tapped twice.
      await go(page, '#/discover/apply');
      await go(page, '#/queue');
      const link = jobsPanel(page).locator('a[href^="#/queue/"]').first();
      const title = (await link.textContent())!.trim();
      await link.click();
      await expect(page.getByRole('heading', { level: 2, name: title })).toBeVisible();
      await page.getByRole('tab', { name: 'Pipeline' }).dblclick();
      await stays(/#\/queue$/);
      if (phone) {
        // At lg the rail stands in for Back on a job opened from the list.
        await jobsPanel(page).locator('a[href^="#/queue/"]').first().click();
        await expect(page.getByRole('heading', { level: 2, name: title })).toBeVisible();
        await page.getByRole('button', { name: 'Back to Pipeline' }).dblclick();
        await stays(/#\/queue$/);
      }

      // Apply mode: a double Save in a new document from Edit documents saves one and comes back.
      await page.getByRole('button', { name: /^(Start|Resume) applying/ }).click();
      await expect(page).toHaveURL(/#\/apply\//);
      const apply = await hash();
      await page.getByRole('link', { name: /^(Edit documents|Write a message)$/ }).click();
      await expect(page.getByRole('heading', { level: 2, name: 'Documents' })).toBeVisible();
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

      // Not a fit on the last job to apply to, clicked twice: back to the Pipeline once.
      const pager = page.getByRole('navigation', { name: 'Jobs to apply' });
      const of = Number((await pager.getByText(/^\d+ of \d+$/).textContent())!.split(' of ')[1]);
      for (let left = of; left > 1; left--) {
        const shown = (await page.getByRole('heading', { level: 2 }).first().textContent())!;
        await page.getByRole('button', { name: 'Not a fit' }).click();
        await expect(page.getByRole('heading', { level: 2 }).first()).not.toHaveText(shown);
        // Past the double-tap guard (ApplyMode DOUBLE_TAP_MS), so the next tap is a new one.
        await page.waitForTimeout(800);
      }
      await page.getByRole('button', { name: 'Not a fit' }).dblclick();
      await stays(/#\/queue$/);
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

    // Review blockers (2026-10-22): coming back must restore what the person was doing, not only
    // the page. Each walk changes the view, leaves with a key action, and comes back both ways.
    test('Live postings: Save → Open → Back keeps the search, the filters, the rows and the scroll', async ({
      page,
    }) => {
      // Synthetic Hacker News posts (no real people): 50 for whatever term is searched, so the
      // list has a Show more. Each read is counted: coming back must not read again.
      let reads = 0;
      await page.route(/^https:\/\/hn\.algolia\.com\//, (r) => {
        const url = r.request().url();
        const json = (body: unknown) =>
          r.fulfill({
            status: 200,
            headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
            body: JSON.stringify(body),
          });
        if (url.includes('search_by_date'))
          return json({
            hits: [
              {
                objectID: '9',
                title: 'Ask HN: Who is hiring? (October 2026)',
                created_at: '2026-10-01',
              },
            ],
          });
        reads++;
        const term = new URL(url).searchParams.get('query') || 'x';
        return json({
          hits: Array.from({ length: 50 }, (_, i) => ({
            objectID: `p-${i}`,
            story_id: 9,
            parent_id: 9,
            created_at: '2026-10-10T10:00:00Z',
            comment_text: `Co${i} | ${term} ${i} | Remote | REMOTE<p>Hiring a ${term}.</p>`,
          })),
        });
      });
      await go(page, '#/discover/live');
      const list = page.getByRole('list', { name: 'Live postings' });
      await expect(list.getByRole('listitem').first()).toBeVisible({ timeout: 20_000 });
      await page.getByRole('button', { name: /^Show more/ }).click();
      await page.getByRole('button', { name: /^Calibrate/ }).click();
      await page.getByLabel(/^Leave out/).fill('Co7 ');
      await page.waitForTimeout(300);
      const count = await list.getByRole('listitem').count();
      expect(count).toBeGreaterThan(40);
      const readsBefore = reads;

      const saveAndOpen = async (n: number) => {
        const row = list.getByRole('listitem').nth(n);
        const title = (await row.getByRole('heading', { level: 3 }).textContent())!
          .replace(/\s*\(opens in new tab\)$/, '')
          .trim();
        await row.scrollIntoViewIfNeeded();
        await row.getByRole('button', { name: 'Save' }).click();
        await page
          .getByRole('region', { name: /^Notifications/ })
          .getByRole('button', { name: 'Open' })
          .click();
        await expect(page.getByRole('heading', { level: 2, name: title })).toBeVisible();
        return title;
      };
      const comesBack = async (title: string) => {
        await expect(page).toHaveURL(/#\/discover\/live$/);
        await expect(list.getByRole('listitem')).toHaveCount(count);
        await expect(page.getByLabel(/^Leave out/)).toHaveValue('Co7 ');
        await expect(
          list.getByRole('heading', { level: 3, name: new RegExp(`^${title}`) }),
        ).toBeInViewport();
        expect(reads).toBe(readsBefore);
      };

      // The in-app way back.
      const first = await saveAndOpen(count - 3);
      await page
        .getByRole('button', { name: 'Back to Live postings' })
        .or(page.getByRole('link', { name: 'Back to Live postings' }))
        .first()
        .click();
      await comesBack(first);
      // The browser's Back.
      const second = await saveAndOpen(count - 6);
      await page.goBack();
      await comesBack(second);
    });

    test('Companies: All and the open row come back after Live postings and Back', async ({
      page,
    }) => {
      await go(page, '#/discover/teams');
      const panel = page.getByRole('region', { name: 'Watched' });
      const show = panel.getByRole('group', { name: 'Show companies' });
      await show.getByRole('button', { name: /^All/ }).click();
      await expect(show.getByRole('button', { name: /^All/ })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      const rowButton = panel.getByRole('button', { name: /^Roles at / }).first();
      const name = (await rowButton.getAttribute('aria-label')) ?? (await rowButton.textContent())!;
      await rowButton.click();
      const open = panel.getByRole('button', { name });
      await expect(open).toHaveAttribute('aria-expanded', 'true');
      const more = page.getByRole('region', { name: 'More ways to find companies' });

      await more.getByRole('link', { name: 'Open Live postings from job boards' }).click();
      await expect(page).toHaveURL(/#\/discover\/live$/);
      await page.getByRole('link', { name: 'Back to companies' }).click();
      await expect(page).toHaveURL(/#\/discover\/teams$/);
      await expect(show.getByRole('button', { name: /^All/ })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await expect(open).toHaveAttribute('aria-expanded', 'true');

      await more.getByRole('link', { name: 'Open Live postings from job boards' }).click();
      await expect(page).toHaveURL(/#\/discover\/live$/);
      await page.goBack();
      await expect(page).toHaveURL(/#\/discover\/teams$/);
      await expect(show.getByRole('button', { name: /^All/ })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await expect(open).toHaveAttribute('aria-expanded', 'true');
    });

    test('Find more like this: the search keeps its title and Recency after a trip away and Back', async ({
      page,
    }) => {
      await openJob(page);
      const title = (await page.getByRole('heading', { level: 2 }).first().textContent())!.trim();
      await page.getByRole('button', { name: `More actions: ${title}` }).click();
      await page.getByRole('menuitem', { name: 'Find more like this' }).click();
      await expect(page).toHaveURL(/#\/discover\/ats\?from=/);
      const searchUrl = page.url();
      const query = () =>
        page
          .getByRole('link', { name: /Search all boards/ })
          .getAttribute('href')
          .then((h) => decodeURIComponent(h ?? ''));
      await expect.poll(query).toContain(title);
      await page.getByRole('combobox', { name: /^Recency/ }).click();
      await page.getByRole('option', { name: 'Past week' }).click();
      await expect.poll(query).toContain('tbs=qdr:w');

      await page.getByRole('tab', { name: 'Pipeline' }).click();
      await expect(page).toHaveURL(/#\/queue/);
      await page.goBack();
      await expect(page).toHaveURL(searchUrl);
      await expect.poll(query).toContain(title);
      await expect.poll(query).toContain('tbs=qdr:w');
      await expect(page.getByRole('link', { name: `Back to ${title}` })).toBeVisible();
    });

    test('Apply mode: a half-typed kit field is still open with its text after Edit documents', async ({
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
      await page.getByRole('link', { name: /^Back to Apply mode/ }).click();
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
