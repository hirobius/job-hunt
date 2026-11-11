import { test, expect } from '@playwright/test';
import { seed } from './routes';

// The title block (#538): the title at typography.title (24px, wraps in full), the company, one
// facts line with 16px icons, and no fit, Saved or blue chips.
for (const width of [390, 1440]) {
  test.describe(`title block ${width}`, () => {
    test.use({ viewport: { width, height: width === 390 ? 844 : 900 } });

    test('title, company, facts; no fit or Saved chip, no blue', async ({ page }) => {
      await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
      await seed(page);
      await page.goto('/#/apply');
      const block = page.locator('[data-rjb-title-block]');
      const h1 = block.getByRole('heading', { level: 1 });
      await expect(h1).toBeVisible();
      expect(await h1.evaluate((e) => getComputedStyle(e).fontSize)).toBe('24px');
      // A long title wraps: never an ellipsis.
      expect(await h1.evaluate((e) => getComputedStyle(e).textOverflow)).not.toBe('ellipsis');
      const facts = block.getByRole('list');
      await expect(facts).toBeVisible();
      const icons = facts.locator('svg');
      expect(await icons.count()).toBeGreaterThanOrEqual(2);
      const size = await icons.first().evaluate((s) => s.getBoundingClientRect().width);
      expect(size).toBe(16);
      // Title above the facts.
      const hb = (await h1.boundingBox())!;
      expect((await facts.boundingBox())!.y).toBeGreaterThan(hb.y);
      await expect(block.getByText('Strong fit', { exact: true })).toHaveCount(0);
      await expect(block.getByText('Saved', { exact: true })).toHaveCount(0);
      await expect(block.locator('[data-tone="info"]')).toHaveCount(0);
    });
  });
}
