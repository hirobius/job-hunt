import { test, expect } from './fixtures';
import { seed } from './routes';

// The Rejected view (Adrian 2026-11-21): a job marked Rejected is found under its own view, beside
// Applied and Interviewing, with a count, at 390 (the view picker) and 1440 (the list chips).
for (const width of [390, 1440]) {
  test.describe(`rejected view ${width}`, () => {
    test.use({ viewport: { width, height: width === 390 ? 844 : 900 } });

    test('mark a job Rejected and find it under Rejected', async ({ page }) => {
      await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
      await seed(page);
      await page.goto('/#/apply');
      const title = (await page.getByRole('heading', { level: 1 }).textContent())!.trim();
      await page
        .getByRole('button', { name: `More actions: ${title}` })
        .first()
        .click();
      await page.getByRole('menu').getByRole('menuitemradio', { name: 'Rejected' }).click();
      const toast = page.getByRole('region', { name: /^Notifications/ });
      await expect(toast.getByText('Moved to Rejected')).toBeVisible();

      if (width === 390) {
        await page.getByRole('button', { name: /^View: / }).click();
        await page.getByRole('menuitemradio', { name: /^Rejected \(1\)$/ }).click();
        await expect(page.getByRole('button', { name: 'View: Rejected' })).toBeVisible();
      } else {
        await page.getByRole('button', { name: /^Rejected 1$/ }).click();
        await expect(page.getByRole('button', { name: /^Rejected 1$/ })).toHaveAttribute(
          'aria-pressed',
          'true',
        );
      }
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    });
  });
}
