import { test, expect, type Locator } from '@playwright/test';
import { openData } from './routes';

// A long row menu on a phone (44px items) must fit a 390px screen with the page scroll-locked, so
// Remove, the last item, can be reached. HDS Menu caps its own height since 0.28 (hds#821; the
// base.css stand-in is gone); this holds it.

// Company logos come from a third-party icon host; tests never reach it (letters show).
test.beforeEach(async ({ context }) => {
  await context.route('https://icons.duckduckgo.com/**', (r) => r.abort());
});

test.use({ viewport: { width: 390, height: 844 } });

test('a row menu on a phone fits the screen and its last item can be clicked', async ({ page }) => {
  await page.goto('/#/apply');
  await page
    .getByRole('button', { name: /Try with sample data/ })
    .first()
    .click();
  await page
    .getByRole('button', { name: /^More actions/ })
    .first()
    .click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  const box = await menu.boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(844);
  await menu.getByRole('menuitem', { name: /^Remove from Apply$/ }).click();
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
  // Recently removed is in the Account menu's Data dialog (#416, #550).
  const data = await openData(page);
  await expect(data.getByRole('button', { name: /^Recently removed/ })).toBeVisible();
});

// A dialog opened from an Account menu item hands focus back to the Account button on close: the
// item that opened it is gone (the Menu is non-modal), so focus would otherwise fall to the body.
test('closing Data or Sign in returns focus to the Account button', async ({ page }) => {
  await page.goto('/#/apply');
  const account = page.getByRole('button', { name: /^Account/ });

  const data = await openData(page);
  await data.getByRole('button', { name: /^Reset local data/ }).click();
  const reset = page.getByRole('alertdialog');
  await expect(reset).toBeVisible();
  await reset.getByRole('button', { name: 'Cancel' }).click();
  await expect(reset).toBeHidden();
  await data.getByRole('button', { name: 'Close' }).click();
  await expect(data).toBeHidden();
  await expect(account).toBeFocused();

  await account.click();
  await page.getByRole('menuitem', { name: /^Sign in/ }).click();
  const signIn = page.getByRole('dialog');
  await expect(signIn).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(signIn).toBeHidden();
  await expect(account).toBeFocused();
});

// The walk control (#542): view picker and pager in one row with no box (no filters chip since
// 2026-11-13: there are no filters). At 390 the longest view name fits, whole. An empty view
// shows its empty state and no pager (prod audit 2026-11-12). The picker opens as a sheet from the
// bottom edge.
test('the walk row fits at 390; the view picker is a sheet', async ({ page }) => {
  await page.goto('/#/apply');
  await page
    .getByRole('button', { name: /Try with sample data/ })
    .first()
    .click();
  const picker = page.getByRole('button', { name: /^View: / });
  await picker.click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  const sheet = (await menu.boundingBox())!;
  expect(Math.round(sheet.x)).toBe(0);
  expect(Math.round(sheet.y + sheet.height)).toBe(844);
  // Seven named views; This week right after Follow up (#640); Passed last (2026-11-13).
  await expect(menu.getByRole('menuitemradio')).toHaveCount(7);
  await expect(menu.getByRole('menuitemradio').nth(6)).toHaveText(/^Passed \(\d+\)$/);
  await expect(menu.getByRole('menuitemradio').nth(2)).toHaveText(/^This week \(\d+\)$/);
  await menu.getByRole('menuitemradio', { name: /^Recently closed/ }).click();
  await expect(page.getByRole('button', { name: 'View: Recently closed' })).toBeVisible();
  await expect(page.getByText('Nothing under “Recently closed”')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Jobs in the list' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /filters?, open All jobs/ })).toHaveCount(0);
  const k = (await picker.boundingBox())!;
  expect(k.x + k.width).toBeLessThanOrEqual(390 - 16);
  // The view's name is whole; the row's targets are 44px tall.
  expect(
    await picker
      .locator('span')
      .first()
      .evaluate((n) => n.scrollWidth <= n.clientWidth + 1),
  ).toBe(true);
  expect((await picker.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  // No box and no outline around the row.
  const row = page.locator('.rjb-apply-pager');
  const st = await row.evaluate((n) => {
    const s = getComputedStyle(n);
    return [s.borderTopWidth, s.outlineStyle, s.boxShadow];
  });
  expect(st).toEqual(['0px', 'none', 'none']);
  await picker.click();
  await page.getByRole('menuitem', { name: 'All jobs' }).click();
  await expect(page.getByRole('dialog', { name: 'All jobs' })).toBeVisible();
});

// The non-empty worst case (prod audit review): the longest view name that has jobs. At 390 and
// 320 the name and the pager are whole, inside the gutter and apart; when they do not fit one row
// the pager wraps under the name.
test('the walk row with jobs: name and pager whole, inside the gutter and apart', async ({
  page,
}) => {
  await page.goto('/#/apply');
  await page
    .getByRole('button', { name: /Try with sample data/ })
    .first()
    .click();
  const picker = page.getByRole('button', { name: /^View: / });
  await picker.click();
  await page.getByRole('menuitemradio', { name: /^Interviewing/ }).click();
  await expect(page.getByRole('button', { name: 'View: Interviewing' })).toBeVisible();
  const pager = page.getByRole('navigation', { name: 'Jobs in the list' });
  await expect(pager).toBeVisible();
  await expect(page.getByText(/^Nothing under/)).toHaveCount(0);
  const whole = async (l: Locator) =>
    expect(await l.evaluate((n) => n.scrollWidth <= n.clientWidth + 1)).toBe(true);
  const name = picker.locator('span').first();
  const box = async (l: Locator) => (await l.boundingBox())!;
  type Box = { x: number; y: number; width: number; height: number };
  const apart = (a: Box, b: Box) =>
    a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
  for (const w of [390, 320]) {
    await page.setViewportSize({ width: w, height: 844 });
    await expect(async () => {
      const [p, k] = [await box(pager), await box(picker)];
      // Inside the gutter, nothing overlaps.
      for (const b of [p, k]) expect(b.x + b.width).toBeLessThanOrEqual(w - 16 + 1);
      expect(apart(p, k)).toBe(true);
    }).toPass();
    await whole(pager);
    await whole(name);
  }
});

test('no pager or view picker at 1440', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#/apply');
  await page
    .getByRole('button', { name: /Try with sample data/ })
    .first()
    .click();
  await expect(page.getByRole('group', { name: 'Views' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Jobs in the list' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^View: / })).toHaveCount(0);
});
