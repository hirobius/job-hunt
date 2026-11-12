import { test, expect } from '@playwright/test';

// #619: with a long Followed list the Companies dialog's body scrolls between a fixed header
// (title, list switch) and a fixed footer (Done); the last row can be reached and is never under Done.
const names = Array.from({ length: 80 }, (_, i) => `Zz Company ${String(i).padStart(2, '0')}`);

for (const [width, height] of [
  [390, 844],
  [1440, 900],
] as const) {
  test(`Companies: the last row is reachable and not covered (${width})`, async ({ page }) => {
    await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
    await page.setViewportSize({ width, height });
    await page.addInitScript((list) => {
      if (localStorage.getItem('rjb_sources')) return;
      localStorage.setItem(
        'rjb_sources',
        JSON.stringify(
          list.map((n, i) => ({
            kind: 'greenhouse',
            ref: `co${i}`,
            label: i === 79 ? `${n} ·` : n,
          })),
        ),
      );
    }, names);
    await page.goto('/#/find');
    await page.getByRole('button', { name: 'Account' }).click();
    await page.getByRole('menuitem', { name: 'Companies' }).click();
    const dialog = page.getByRole('dialog', { name: 'Companies' });
    await expect(dialog.getByRole('radio', { name: /Followed/ })).toBeVisible();
    const body = dialog.getByTestId('companies-body');
    const last = dialog.getByRole('button', { name: 'Ignore Zz Company 79' });
    await expect(last).toBeAttached();
    await body.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await expect(last).toBeInViewport();
    const done = dialog.getByRole('button', { name: 'Done' });
    const [l, d, b, title] = await Promise.all([
      last.boundingBox(),
      done.boundingBox(),
      body.boundingBox(),
      dialog.getByRole('heading', { name: 'Companies' }).boundingBox(),
    ]);
    // The body actually scrolls, and the row sits inside it, above Done.
    expect(await body.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    expect(l!.y + l!.height).toBeLessThanOrEqual(b!.y + b!.height + 0.5);
    expect(l!.y + l!.height).toBeLessThanOrEqual(d!.y + 0.5);
    // Header and footer stay on screen while the list is scrolled.
    expect(title!.y).toBeGreaterThanOrEqual(0);
    expect(d!.y + d!.height).toBeLessThanOrEqual(height + 0.5);
    // The hit at the row's button is the button itself (nothing drawn over it).
    const hit = await last.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return !!top && el.contains(top);
    });
    expect(hit).toBe(true);
    // The trailing " ·" is display-cleaned.
    await expect(dialog.getByText('Zz Company 79', { exact: true })).toBeVisible();
  });
}
