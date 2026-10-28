import { test, expect } from '@playwright/test';
import { seed } from './routes';

// Simplify 2/9 (#383): Today is home. Its three panels, in order, each open what already exists,
// and the Pipeline is one tap away as Jobs. At 390 (phone first) and 1440.
for (const width of [390, 1440]) {
  test(`Today at ${width}: Review new, Apply, Follow up, each one tap in`, async ({ page }) => {
    await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await seed(page);
    // A fresh load with no route lands on Today.
    await page.goto('/');
    await expect(page).toHaveURL(/#\/today$/);
    await expect(page.getByRole('heading', { level: 2, name: 'Today' })).toBeVisible();
    const main = page.getByRole('main');
    const panels = main.getByRole('region');
    await expect(panels).toHaveCount(3);
    await expect(panels.nth(0)).toHaveAccessibleName('Review new');
    await expect(panels.nth(1)).toHaveAccessibleName(/^Apply \(\d+\)$/);
    await expect(panels.nth(2)).toHaveAccessibleName(/^Follow up \(\d+ due\)$/);
    // No sideways scroll on a phone.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    // Review new: every posting, as the list it is today; Back names Today.
    await panels.nth(0).getByRole('link', { name: 'Browse new postings' }).click();
    await expect(page).toHaveURL(/#\/discover\/live\?from=%2Ftoday$/);
    await page.goBack();
    await expect(page).toHaveURL(/#\/today$/);

    // Follow up: the sample has due ones; the button opens the follow-up dialog.
    const follow = page.getByRole('region', { name: /^Follow up/ });
    await expect(follow.getByText(/^Due: /)).toBeVisible();
    await follow.getByRole('button', { name: /^Follow up/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();

    // Jobs is the Pipeline, unchanged inside.
    await page.getByRole('tab', { name: 'Jobs' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Pipeline' })).toBeVisible();
    await page.getByRole('tab', { name: 'Today' }).click();
    await expect(page).toHaveURL(/#\/today$/);

    // Apply: Start applying opens Apply mode.
    await page
      .getByRole('region', { name: /^Apply/ })
      .getByRole('button')
      .click();
    await expect(page).toHaveURL(/#\/apply\//);
  });
}
