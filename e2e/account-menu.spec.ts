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

// #549: 8 items in 4 groups, 9 signed out with Scan now (#694; #688: the theme is the app bar's ThemeToggle). Each row has a 16px
// icon; rows are 44px on a phone and 38px on a desktop; Pause animations is a toggle that shows its
// state; Sign in is a grey key.
for (const [width, height, row] of [
  [390, 844, 44],
  [1440, 900, 38],
] as const)
  test(`rows, icons, toggles and the grey key (${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
    await seed(page);
    const menu = await openAccount(page);
    await expect(
      menu.getByText('On this device only. Sign in to sync across devices.', { exact: true }),
    ).toBeVisible();
    const rows = menu.locator('[role="menuitem"]:not(.rjb-menu-key), [role="menuitemcheckbox"]');
    await expect(rows).toHaveCount(8);
    await expect(menu.getByRole('menuitem', { name: 'Scan now' })).toBeVisible();
    await expect(menu.getByRole('menuitemcheckbox', { name: 'Dark theme' })).toHaveCount(0);
    for (const r of await rows.all()) {
      const b = (await r.boundingBox())!;
      expect(Math.round(b.height), await r.innerText()).toBe(row);
      const icon = (await r.locator(':scope > svg').first().boundingBox())!;
      expect([Math.round(icon.width), Math.round(icon.height)]).toEqual([16, 16]);
    }
    // The grey key: HDS secondary, a real fill, 44px tall on a phone.
    const key = menu.getByRole('menuitem', {
      name: 'Sign in',
      exact: true,
    });
    const bg = await key.evaluate((n) => getComputedStyle(n).backgroundColor);
    expect(bg).not.toBe('rgba(0, 0, 0, 0)');
    if (width === 390) expect((await key.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    // Pause animations flips in place: the menu stays open and the switch moves.
    const pause = menu.getByRole('menuitemcheckbox', { name: 'Pause animations' });
    const was = await pause.getAttribute('aria-checked');
    const sw = pause.locator('.rjb-menu-switch');
    const before = (await sw.evaluate((n) => getComputedStyle(n).backgroundColor)) as string;
    await pause.click();
    await expect(menu).toBeVisible();
    await expect(pause).toHaveAttribute('aria-checked', was === 'true' ? 'false' : 'true');
    await expect
      .poll(() => sw.evaluate((n) => getComputedStyle(n).backgroundColor))
      .not.toBe(before);
  });

// The Account glyph is filled (Adrian 2026-11-13): a solid content-primary circle the ThemeToggle's
// 28px in its 44px box, the person knocked out to the bar. The circle is at least 3:1 on the bar.
for (const theme of ['light', 'dark'] as const) {
  test(`the Account glyph is a filled 28px circle in a 44px box, 3:1 on the bar (${theme})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: theme });
    await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
    await seed(page);
    const button = page.getByRole('button', { name: 'Account' });
    const box = (await button.boundingBox())!;
    expect(Math.round(box.width)).toBe(44);
    expect(Math.round(box.height)).toBe(44);
    const glyph = button.locator('svg.rjb-account-glyph');
    const g = (await glyph.boundingBox())!;
    expect(Math.round(g.width)).toBe(28);
    // The ThemeToggle's sun/moon is the same 28px (its layout size: the icon turns, so its box grows).
    const toggle = page.locator('.rjb-theme-toggle .hds-theme-toggle__icon');
    expect(await toggle.evaluate((el) => getComputedStyle(el).width)).toBe('28px');
    const ratio = await glyph.evaluate((svg) => {
      const rgb = (c: string) =>
        c
          .match(/[\d.]+/g)!
          .slice(0, 3)
          .map(Number);
      const lum = ([r, g, b]: number[]) => {
        const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      let bg = 'rgba(0, 0, 0, 0)';
      for (let el: Element | null = svg.parentElement; el; el = el.parentElement) {
        const c = getComputedStyle(el).backgroundColor;
        if (!/rgba\(.*, 0\)$/.test(c) && c !== 'transparent') {
          bg = c;
          break;
        }
      }
      const [a, b] = [lum(rgb(getComputedStyle(svg).color)), lum(rgb(bg))];
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    });
    expect(ratio).toBeGreaterThanOrEqual(3);
  });
}
