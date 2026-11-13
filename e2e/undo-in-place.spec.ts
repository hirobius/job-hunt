import { test, expect } from '@playwright/test';
import { JOB_LINK, listScope, openJob, seed, topTab } from './routes';

// #593 item 8 (Adrian 2026-11-11): every Undo puts the item back and leaves the person on the page
// they are on. Remove a job from its page, go to Find, press the toast's Undo: still on Find, and
// the job is back in Apply.
for (const width of [390, 1440] as const) {
  test.describe(`Undo in place at ${width}`, () => {
    test.use({ viewport: { width, height: 844 } });

    test.beforeEach(async ({ page }) => {
      await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
      await seed(page);
    });

    test("a job page's Remove, undone on Find, stays on Find", async ({ page }) => {
      await openJob(page);
      const title = (await page.getByRole('heading', { level: 1 }).first().textContent())!.trim();
      await page
        .getByRole('button', { name: `More actions: ${title}` })
        .first()
        .click();
      await page.getByRole('menuitem', { name: 'Remove from Apply' }).click();
      const undo = page.getByRole('button', { name: 'Undo' });
      await expect(undo).toBeVisible();

      await topTab(page, 'Review').click();
      await expect(page).toHaveURL(/#\/review$/);
      await expect(undo).toBeVisible();
      await undo.click();
      // Undo never navigates: still on Find, focus not dropped to <body>.
      await page.waitForTimeout(600);
      await expect(page).toHaveURL(/#\/review$/);
      await expect(page.getByRole('region', { name: /^New postings$/ })).toBeVisible();
      await expect
        .poll(() => page.evaluate(() => document.activeElement !== document.body))
        .toBe(true);

      // The job is back in Apply.
      await topTab(page, 'Apply').click();
      await expect(page).toHaveURL(/#\/apply/);
      const list = (await listScope(page)).getByRole('navigation', { name: 'Jobs' });
      await expect(list.locator(JOB_LINK).filter({ hasText: title }).first()).toBeVisible();
    });
  });
}
