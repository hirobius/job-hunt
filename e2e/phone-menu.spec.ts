import { test, expect } from '@playwright/test';

// A long row menu on a phone (44px items) must fit a 390px screen with the page scroll-locked, so
// Remove, the last item, can be reached. HDS Menu caps its own height since 0.28 (hds#821; the
// base.css stand-in is gone); this holds it.

// Company logos come from a third-party icon host; tests never reach it (letters show).
test.beforeEach(async ({ context }) => {
  await context.route('https://icons.duckduckgo.com/**', (r) => r.abort());
});

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

// A dialog opened from an Account menu item hands focus back to the Account button on close: the
// item that opened it is gone (the Menu is non-modal), so focus would otherwise fall to the body.
test('closing Reset or Sign in returns focus to the Account button', async ({ page }) => {
  await page.goto('/#/queue');
  const account = page.getByRole('button', { name: /^Account/ });

  await account.click();
  await page.getByRole('menuitem', { name: /^Reset local data/ }).click();
  const reset = page.getByRole('alertdialog');
  await expect(reset).toBeVisible();
  await reset.getByRole('button', { name: 'Cancel' }).click();
  await expect(reset).toBeHidden();
  await expect(account).toBeFocused();

  await account.click();
  await page.getByRole('menuitem', { name: /^Sign in/ }).click();
  const signIn = page.getByRole('dialog');
  await expect(signIn).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(signIn).toBeHidden();
  await expect(account).toBeFocused();
});
