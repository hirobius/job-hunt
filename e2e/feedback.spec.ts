import { test, expect, type Locator, type Page } from '@playwright/test';
import { go, openJob, seed } from './routes';

// The feedback sweep (#212): every row and page action on the Pipeline, the job page, Documents
// and Companies must change something visible within 300 ms of the press: the page's text (a
// toast, a dialog, a new state), the route, or a new keyframe animation (a flash, a pop, a
// collapse). A press that only changes an aria-label or a colour transition does not count.
test.use({
  permissions: ['clipboard-read', 'clipboard-write'],
  viewport: { width: 1440, height: 900 },
});

const LIMIT_MS = 300;

/** Watch from each press for the first visible change; the page records how long it took. */
async function installWatcher(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __fb: { start: number; seen: number } };
    w.__fb = { start: 0, seen: -1 };
    const sig = () => `${document.body.innerText}|${location.hash}`;
    const keyframes = () =>
      document
        .getAnimations()
        .filter((a) => a instanceof CSSAnimation && a.playState === 'running');
    addEventListener(
      'pointerdown',
      () => {
        const base = sig();
        const before = new Set(keyframes());
        const start = performance.now();
        w.__fb = { start, seen: -1 };
        const tick = () => {
          const t = performance.now() - start;
          if (w.__fb.start !== start) return;
          if (sig() !== base || keyframes().some((a) => !before.has(a))) {
            w.__fb.seen = t;
            return;
          }
          if (t < 1500) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },
      true,
    );
  });
}

/** Press a control and require a visible change within the limit. */
async function press(page: Page, target: Locator, name: string) {
  await target.click();
  await page.waitForFunction(() => {
    const fb = (window as unknown as { __fb: { start: number; seen: number } }).__fb;
    return fb.seen >= 0 || performance.now() - fb.start > 1500;
  });
  const seen = await page.evaluate(
    () => (window as unknown as { __fb: { seen: number } }).__fb.seen,
  );
  expect(seen, `${name}: nothing visible changed`).toBeGreaterThanOrEqual(0);
  expect(seen, `${name}: took ${Math.round(seen)} ms`).toBeLessThanOrEqual(LIMIT_MS);
}

const button = (page: Page, name: string | RegExp) =>
  page.getByRole('button', { name, exact: typeof name === 'string' }).first();
const item = (page: Page, name: string) =>
  page
    .getByRole('menuitem', { name, exact: true })
    .or(page.getByRole('menuitemradio', { name, exact: true }));

/** Open a row's menu (itself an action) and pick an item. */
async function menu(page: Page, trigger: string, choice: string) {
  await press(page, button(page, trigger), trigger);
  await press(page, item(page, choice), `${trigger} → ${choice}`);
}

async function closeOverlay(page: Page) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
}

test.beforeEach(async ({ page }) => {
  await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  await installWatcher(page);
  await seed(page);
});

test('Pipeline: every row and page action answers within 300 ms', async ({ page }) => {
  await go(page, '#/queue');
  await press(page, button(page, 'Mark applied: Solutions Engineer'), 'Mark applied');
  await expect(
    page.getByText('Marked applied · Follow up in 7 days', { exact: true }),
  ).toBeVisible();

  await menu(page, 'More actions: Senior Product Designer', 'Star');
  await menu(page, 'More actions: Senior Product Designer', 'Unstar');
  await menu(page, 'More actions: Implementation Consultant', 'Retire');
  await menu(page, 'More actions: Product Designer', 'Interviewing');
  await menu(page, 'More actions: Clinical Systems Analyst', 'Remove');
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
  await expect(button(page, 'More actions: Clinical Systems Analyst')).toHaveCount(0);

  for (const name of ['Status: Active', 'Sort: Newest']) {
    await press(page, button(page, name), name);
    await closeOverlay(page);
  }
  for (const name of ['Add job', 'Follow up: UX Researcher']) {
    await press(page, button(page, name), name);
    await closeOverlay(page);
  }
  await press(page, button(page, 'Check which are still open'), 'Check which are still open');
  await press(page, button(page, 'Dismiss'), 'Dismiss getting started');
  await press(page, button(page, 'Start applying'), 'Start applying');
  await go(page, '#/queue');
  await press(page, button(page, 'Find the next company'), 'Find the next company');
});

test('Job page: every header and panel action answers within 300 ms', async ({ page }) => {
  await openJob(page);
  const star = page.getByRole('button', { name: /^Star(red)?$/ });
  await press(page, star, 'Star toggle');
  await expect(star.locator('svg')).toHaveClass(/rjb-pop/);
  await press(page, star, 'Star toggle back');

  const more = (await page
    .getByRole('button', { name: /^More actions: / })
    .getAttribute('aria-label'))!;
  await menu(page, more, 'Retire');
  await menu(page, more, 'Unretire');
  await menu(page, more, 'Interviewing');

  await press(page, button(page, 'Edit details'), 'Edit details');
  await press(page, button(page, 'Add starter tasks'), 'Add starter tasks');
  await press(page, button(page, 'Add a to-do'), 'Add a to-do');
  await closeOverlay(page);
  for (const tab of ['Screening', 'Interviews', 'Overview'])
    await press(page, page.getByRole('tab', { name: tab }), `${tab} tab`);

  await menu(page, more, 'Remove');
  await expect(page).toHaveURL(/#\/queue$/);
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
});

test('Documents: Pin, Duplicate, Copy and Delete answer within 300 ms', async ({ page }) => {
  await go(page, '#/copy-deck');
  const row = button(page, /^Follow-up after applying/);
  await press(page, row, 'Open a document row');
  await press(page, button(page, 'Copy'), 'Copy');

  const more = 'More actions for Follow-up after applying';
  await menu(page, more, 'Pin');
  await expect(page.getByRole('listitem', { name: 'Follow-up after applying' })).toHaveClass(
    /rjb-flash/,
  );
  await menu(page, more, 'Unpin');

  await menu(page, more, 'Duplicate');
  const copy = page.getByRole('listitem', { name: 'Follow-up after applying (copy)' });
  await expect(copy).toHaveClass(/rjb-flash/);
  await expect(copy).toBeInViewport();

  await menu(page, more, 'Delete');
  await closeOverlay(page);
  await press(page, button(page, 'Open Follow-up after applying'), 'Open');
  await go(page, '#/copy-deck');
  await press(page, button(page, 'New résumé'), 'New résumé');
});

test('Companies: star, roles and the page actions answer within 300 ms', async ({ page }) => {
  await go(page, '#/discover/teams');
  const star = page.getByRole('button', { name: 'Star Ensono as a dream company' }).first();
  await press(page, star, 'Dream star');
  await expect(star.locator('svg')).toHaveClass(/rjb-pop/);
  await press(page, button(page, 'Roles at Okta'), 'Roles');
  for (const name of ['Add a company', /^Change where/, 'Manage track', 'New track']) {
    await press(page, button(page, name), String(name));
    await closeOverlay(page);
  }
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('keeps the state and the toast, drops the movement', async ({ page }) => {
    const moving = () =>
      page.evaluate(() =>
        document
          .getAnimations()
          .filter((a) => a instanceof CSSAnimation && a.animationName.startsWith('rjb-'))
          .map((a) => (a as CSSAnimation).animationName),
      );
    await openJob(page);
    const star = page.getByRole('button', { name: /^Star(red)?$/ });
    const was = await star.getAttribute('aria-label');
    await press(page, star, 'Star toggle');
    await expect(star).not.toHaveAttribute('aria-label', was!);
    await expect(page.getByText(/^(Starred|Unstarred)$/)).toBeVisible();
    expect(await moving()).toEqual([]);

    await go(page, '#/queue');
    await menu(page, 'More actions: Clinical Systems Analyst', 'Remove');
    expect(await moving()).toEqual([]);
    await expect(button(page, 'More actions: Clinical Systems Analyst')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
  });
});
