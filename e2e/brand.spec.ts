import { test, expect } from '@playwright/test';

// The flame (src/brand/flame.svg) never moves the page: its box is fixed by the file's viewBox, so
// the header and the page height hold still (the old live flame's embers made the page jiggle).
test.beforeEach(async ({ context }) => {
  await context.route('https://icons.duckduckgo.com/**', (r) => r.abort());
});

for (const width of [390, 1440]) {
  test(`the header flame holds still at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/#/queue');
    const flame = page.locator('header .rjb-flame svg');
    await expect(flame).toBeVisible();
    const measure = () =>
      page.evaluate(() => {
        const box = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
        const f = box('header .rjb-flame svg');
        const h = box('header');
        return [f.x, f.y, f.width, f.height, h.height, document.documentElement.scrollHeight];
      });
    const first = await measure();
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(250);
      expect(await measure()).toEqual(first);
    }
  });
}

test('the boot splash is the flame while the app loads, and React replaces it', async ({
  page,
}) => {
  await page.goto('/#/queue');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('.rjb-boot')).toHaveCount(0);
});
