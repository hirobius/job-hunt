import { test, expect } from '@playwright/test';
import { seed } from './routes';

// The saved-list loop (#534): Apply is the one saved list. No star; More has Remove from Apply,
// which moves the job to Recently removed with "Removed from Apply: <title>" and Undo.
for (const width of [390, 1440]) {
  test.describe(`saved list ${width}`, () => {
    test.use({ viewport: { width, height: width === 390 ? 844 : 900 } });

    test('no star; Remove from Apply with Undo', async ({ page }) => {
      await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
      await seed(page);
      await page.goto('/#/apply');
      const h1 = page.getByRole('heading', { level: 1 });
      const title = (await h1.textContent())!.trim();
      await expect(page.getByRole('button', { name: /^Star(red)?$/ })).toHaveCount(0);
      await page
        .getByRole('button', { name: `More actions: ${title}` })
        .first()
        .click();
      const menu = page.getByRole('menu');
      await expect(menu.getByRole('menuitem', { name: /Star/ })).toHaveCount(0);
      await menu.getByRole('menuitem', { name: 'Remove from Apply' }).click();
      const toast = page.getByRole('region', { name: /^Notifications/ });
      await expect(toast.getByText(`Removed from Apply: ${title}`)).toBeVisible();
      await expect(page.getByRole('heading', { level: 1, name: title })).toHaveCount(0);
      // Focus moves to the next title (#534).
      await expect
        .poll(() => page.evaluate(() => document.activeElement?.matches('h1') ?? false))
        .toBe(true);
      await toast.getByRole('button', { name: 'Undo' }).click();
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
      await expect(page.getByText(/shortlist/i)).toHaveCount(0);
    });
  });
}
