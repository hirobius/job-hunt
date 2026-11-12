import { test, expect, type Locator } from '@playwright/test';
import { openAllJobs, openData } from './routes';

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

// The walk control (#542): view picker, "N filters" chip and pager in one row with no box. At 390
// the worst case (the longest view name, both filters on) fits, the name whole. An empty view
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
  // Six named views; This week right after Follow up (#640).
  await expect(menu.getByRole('menuitemradio')).toHaveCount(6);
  await expect(menu.getByRole('menuitemradio').nth(2)).toHaveText(/^This week \(\d+\)$/);
  await menu.getByRole('menuitemradio', { name: /^Recently closed/ }).click();
  await expect(page.getByRole('button', { name: 'View: Recently closed' })).toBeVisible();
  // Both filters on: search and Remote only.
  // They are the All jobs sheet's (#543): set them there, then close it.
  const all = await openAllJobs(page);
  await all.getByRole('button', { name: 'Remote only' }).click();
  await all.getByLabel('Search saved jobs').fill('zzz');
  await page.keyboard.press('Escape');
  await expect(all).toHaveCount(0);
  const chip = page.getByRole('button', { name: '2 filters, open All jobs' });
  await expect(chip).toBeVisible();
  await expect(page.getByText('Nothing under “Recently closed”')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Jobs in the list' })).toHaveCount(0);
  const c = (await chip.boundingBox())!;
  const k = (await picker.boundingBox())!;
  expect(c.x + c.width).toBeLessThanOrEqual(390 - 16);
  expect(k.x + k.width).toBeLessThanOrEqual(c.x);
  // The view's name is whole; the row's targets are 44px tall.
  expect(
    await picker
      .locator('span')
      .first()
      .evaluate((n) => n.scrollWidth <= n.clientWidth + 1),
  ).toBe(true);
  for (const b of [picker, chip])
    expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  // No box and no outline around the row.
  const row = page.locator('.rjb-apply-pager');
  const st = await row.evaluate((n) => {
    const s = getComputedStyle(n);
    return [s.borderTopWidth, s.outlineStyle, s.boxShadow];
  });
  expect(st).toEqual(['0px', 'none', 'none']);
  await chip.click();
  await expect(page.getByRole('dialog', { name: 'All jobs' })).toBeVisible();
});

// The non-empty worst case (prod audit review): the longest view name that has jobs, both filters
// on. The three do not fit one row at 390 or 320: the name and the chip keep their row and the
// pager wraps under them, all whole, inside the gutter and apart.
test('the walk row with jobs: name, chip and pager whole; the pager wraps under the name', async ({
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
  const all = await openAllJobs(page);
  await all.getByRole('button', { name: 'Remote only' }).click();
  await all.getByLabel('Search saved jobs').fill('e');
  await page.keyboard.press('Escape');
  await expect(all).toHaveCount(0);
  const chip = page.getByRole('button', { name: '2 filters, open All jobs' });
  const pager = page.getByRole('navigation', { name: 'Jobs in the list' });
  await expect(chip).toBeVisible();
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
      const [p, c, k] = [await box(pager), await box(chip), await box(picker)];
      // Inside the gutter, nothing overlaps, the name and the chip share a row.
      for (const b of [p, c, k]) expect(b.x + b.width).toBeLessThanOrEqual(w - 16 + 1);
      expect(apart(p, c) && apart(p, k) && apart(c, k)).toBe(true);
      expect(k.x + k.width).toBeLessThanOrEqual(c.x);
      // The three do not fit one row here: the pager wraps under the name, never cutting it.
      expect(p.y).toBeGreaterThanOrEqual(k.y + k.height - 1);
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
