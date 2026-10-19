import { test, expect, type Page } from '@playwright/test';

// Sign-in on a phone (2026-10-17): with the iOS keyboard up only ~400px of a 390px-wide phone is
// visible. The dialog is a sheet pinned to the top of the visual viewport, so the field and the
// button stay in view. At desktop it stays a centred dialog.
const openSignIn = async (page: Page) => {
  await page.goto('/#/queue');
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: /^Sign in/ }).click();
  return page.getByRole('dialog', { name: 'Sign in' });
};

test('phone with the keyboard up: field and button sit above it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 400 });
  const dialog = await openSignIn(page);
  await expect(page.getByRole('textbox', { name: 'Email' })).toBeFocused();
  const box = (await dialog.boundingBox())!;
  expect(box.y).toBeLessThanOrEqual(24);
  const button = (await page.getByRole('button', { name: 'Continue with email' }).boundingBox())!;
  expect(button.y + button.height).toBeLessThanOrEqual(400);
  expect(button.width).toBeGreaterThan(box.width - 64);
});

test('desktop: a centred dialog', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const dialog = await openSignIn(page);
  const box = (await dialog.boundingBox())!;
  expect(Math.abs(box.y + box.height / 2 - 450)).toBeLessThanOrEqual(2);
  expect(box.width).toBeLessThanOrEqual(440);
});
