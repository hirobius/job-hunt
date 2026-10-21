import { test, expect } from '@playwright/test';

// HDS gap (#146): HDS Menu doesn't cap its height to the space Radix measures, and since 0.26 its
// items are 44px on a phone, so a long row menu ran past the bottom of a 390px screen with the page
// scroll-locked: Remove, the last item, could not be reached. base.css caps it; this holds it.
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
