import { test, expect } from '@playwright/test';
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
// the worst case (the longest view name, both filters on) fits: the name truncates, never the
// pager. The picker opens as a sheet from the bottom edge.
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
  await expect(menu.getByRole('menuitemradio')).toHaveCount(5);
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
  const pager = page.getByRole('navigation', { name: 'Jobs in the list' });
  const p = (await pager.boundingBox())!;
  const c = (await chip.boundingBox())!;
  const k = (await picker.boundingBox())!;
  expect(p.x + p.width).toBeLessThanOrEqual(390 - 16);
  expect(c.x + c.width).toBeLessThanOrEqual(p.x);
  expect(k.x + k.width).toBeLessThanOrEqual(c.x);
  // The pager's text is whole; the row's targets are 44px tall.
  expect(await pager.evaluate((n) => n.scrollWidth <= n.clientWidth + 1)).toBe(true);
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
