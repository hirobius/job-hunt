import { test, expect } from '@playwright/test';
import { findMore, seed, topTab, openAllJobs } from './routes';

// The final shell (simplify #383 + Q6; #471): two tabs, Find and Apply. Find, in order: the scan's
// status with Scan now and Review new (the Browse list); the companies a scan finds are the
// Companies dialog's Found list (#618, auto-scan.spec.ts). At lg the selected posting is the right column, "Pick a posting" until one is
// picked. Follow up and Apply live on the Apply tab (#471 slice 3). At 390 (phone first) and 1440.
for (const width of [390, 1440]) {
  test(`Find at ${width}: scan status and Review new; Follow up is on Apply`, async ({ page }) => {
    await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await seed(page);
    // A fresh load with no route lands on Find; an old Today or Companies link does too.
    await page.goto('/');
    await expect(page).toHaveURL(/#\/find$/);
    await page.goto('/#/today');
    await expect(page).toHaveURL(/#\/find$/);
    await page.goto('/#/discover/live');
    await expect(page).toHaveURL(/#\/find$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Find' })).toBeVisible();
    // Each tab's label, then its count when it shows one (#548).
    await expect(page.getByRole('navigation', { name: 'Sections' }).getByRole('link')).toHaveText([
      /^Find( \d+\+?)?$/,
      /^Apply( \d+\+?)?$/,
    ]);
    // Scan now is the short header's More menu (#544), on the h1's row.
    await expect(findMore(page)).toBeVisible();
    const panels = page.getByRole('main').getByRole('region');
    await expect(panels.nth(0)).toHaveAccessibleName(/^Review\b/);
    await expect(page.getByRole('region', { name: /^Follow up/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Start applying/ })).toHaveCount(0);
    if (width >= 1024) await expect(page.getByText('Pick a posting')).toBeVisible();
    else await expect(page.getByText('Pick a posting')).toHaveCount(0);
    // No sideways scroll on a phone.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    // Apply: the list (below lg) or the list beside the first job (lg), with Follow up in it.
    await topTab(page, 'Apply').click();
    // Below lg the tab is one job and its list is the All jobs sheet (Proposal A): Follow up is
    // its view (#543), and the job's More opens the dialog. From lg the agenda under the column.
    if (width < 1024) {
      const sheet = await openAllJobs(page);
      await sheet.getByRole('button', { name: /^Follow up \d/ }).click();
      await sheet.getByRole('navigation', { name: 'Jobs' }).getByRole('link').first().click();
      await expect(sheet).toHaveCount(0);
      await page
        .getByRole('button', { name: /^More actions: / })
        .first()
        .click();
      await page.getByRole('menuitem', { name: /^Follow up/ }).click();
    } else {
      await expect(page.getByRole('navigation', { name: 'Jobs' })).toBeVisible();
      await page
        .getByRole('region', { name: /^Follow up/ })
        .getByRole('button', { name: /^Follow up/ })
        .first()
        .click();
    }
    // The Follow up dialog (the All jobs sheet closes under it below lg).
    await expect(page.getByRole('dialog', { name: /^Follow up/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: /^Follow up/ })).toHaveCount(0);
    if (await page.getByRole('dialog').count()) await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await topTab(page, 'Find').click();
    await expect(page).toHaveURL(/#\/find$/);
  });
}
