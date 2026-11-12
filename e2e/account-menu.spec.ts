import { test, expect } from '@playwright/test';
import { openData, seed } from './routes';

// The Account menu (account menu PR, 2026-11-08): below sm a bottom sheet (full width, on the
// bottom edge, its own scroll, a grab handle), from sm a dropdown at least 16rem wide. Still an HDS
// Menu either way: arrow keys, Escape. Its look rides the late styles (theme/late.css).
async function openAccount(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Account' }).click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  // The late styles arrive with the animated logo's chunk, just after first paint.
  await expect.poll(() => menu.evaluate((m) => getComputedStyle(m).minWidth)).not.toBe('auto');
  return menu;
}

test('on a phone it is a bottom sheet with a handle and its own scroll', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  await seed(page);
  const menu = await openAccount(page);
  await expect
    .poll(async () => {
      const b = (await menu.boundingBox())!;
      return [Math.round(b.x), Math.round(b.width), Math.round(b.y + b.height)];
    })
    .toEqual([0, 390, 700]);
  expect((await menu.boundingBox())!.height).toBeLessThanOrEqual(700 * 0.85 + 1);
  const handle = menu.locator('.rjb-sheet-handle');
  await expect(handle).toBeVisible();
  // A real 36x4 pill, centred (not a 0x0 span).
  const h = (await handle.boundingBox())!;
  expect([Math.round(h.width), Math.round(h.height)]).toEqual([36, 4]);
  expect(Math.abs(h.x + h.width / 2 - 195)).toBeLessThanOrEqual(1);
  // Every item is reachable: the sheet scrolls to its last one.
  const last = menu.getByRole('menuitem', { name: 'Privacy and terms' });
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeInViewport();
  // Data is one item now (#550): its actions are in the Data dialog.
  await expect(menu.getByRole('menuitem', { name: 'Data', exact: true })).toBeVisible();
  // Still a menu: Escape closes it and focus goes back to Account.
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(page.getByRole('button', { name: 'Account' })).toBeFocused();
});

test('on a desktop it is a dropdown at least 16rem wide, under its button', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  await seed(page);
  const menu = await openAccount(page);
  const b = (await menu.boundingBox())!;
  expect(b.width).toBeGreaterThanOrEqual(256);
  const button = (await page.getByRole('button', { name: 'Account' }).boundingBox())!;
  expect(b.y).toBeGreaterThan(button.y + button.height - 1);
  await expect(menu.locator('.rjb-sheet-handle')).toBeHidden();
});

// The Data dialog (#550): one lazy dialog for back up, restore, export, Recently removed and the
// repairs. On a phone a bottom sheet (full width on the bottom edge), from sm a centred dialog.
test('the Data dialog is a bottom sheet on a phone and its keys are 44px tall', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  await seed(page);
  const dialog = await openData(page);
  await expect
    .poll(async () => {
      const b = (await dialog.boundingBox())!;
      return [Math.round(b.x), Math.round(b.width), Math.round(b.y + b.height)];
    })
    .toEqual([0, 390, 844]);
  await expect(dialog.locator('.rjb-sheet-handle')).toBeVisible();
  for (const name of ['Back up', 'Restore…', 'Export CSV', 'Export links', 'Reload app'])
    expect(
      (await dialog.getByRole('button', { name }).boundingBox())!.height,
    ).toBeGreaterThanOrEqual(44);
  // Reset asks over it; Cancel puts focus back on the Reset key, Escape then closes Data.
  const reset = dialog.getByRole('button', { name: 'Reset local data…' });
  await reset.scrollIntoViewIfNeeded();
  await reset.click();
  const confirm = page.getByRole('alertdialog', { name: 'Reset local data?' });
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(confirm).toBeHidden();
  await expect(reset).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Account' })).toBeFocused();
});

test('the Data dialog is a centred dialog on a desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  await seed(page);
  const dialog = await openData(page);
  const b = (await dialog.boundingBox())!;
  expect(Math.abs(b.x + b.width / 2 - 720)).toBeLessThanOrEqual(1);
  expect(b.y + b.height).toBeLessThan(900);
  await expect(dialog.locator('.rjb-sheet-handle')).toBeHidden();
});
