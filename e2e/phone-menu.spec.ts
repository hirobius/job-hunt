import { test, expect } from '@playwright/test';

// A long row menu on a phone (44px items) must fit a 390px screen with the page scroll-locked, so
// Remove, the last item, can be reached. HDS Menu caps its own height since 0.28 (hds#821; the
// base.css stand-in is gone); this holds it.
test.use({ viewport: { width: 390, height: 844 } });

test('a row menu on a phone fits the screen and its last item can be clicked', async ({ page }) => {
  await page.goto('/#/queue');
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
  await menu.getByRole('menuitem', { name: /^Remove$/ }).click();
  await expect(page.getByRole('button', { name: /^Recently removed/ })).toBeVisible();
});
