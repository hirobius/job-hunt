import { test, expect } from '@playwright/test';
import { seed } from './routes';

// The final shell (simplify #383 + Q6): two tabs, Today and Jobs. Today, in order: the scan's
// status with Scan now, Review new (the Browse list), Apply and Follow up; New companies follow
// once a scan finds some (auto-scan.spec.ts). At 390 (phone first) and 1440.
for (const width of [390, 1440]) {
  test(`Today at ${width}: scan status, Review new, Apply, Follow up, each one tap in`, async ({
    page,
  }) => {
    await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await seed(page);
    // A fresh load with no route lands on Today; an old Companies link does too.
    await page.goto('/');
    await expect(page).toHaveURL(/#\/today$/);
    await page.goto('/#/discover/live');
    await expect(page).toHaveURL(/#\/today$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    await expect(page.getByRole('tab')).toHaveText(['Today', 'Jobs']);
    await expect(page.getByRole('button', { name: /^(Scan now|Stop scan)$/ })).toBeVisible();
    const panels = page.getByRole('main').getByRole('region');
    await expect(panels.nth(0)).toHaveAccessibleName(/^Review new/);
    await expect(panels.nth(1)).toHaveAccessibleName(/^Apply \(\d+\)$/);
    await expect(panels.nth(2)).toHaveAccessibleName(/^Follow up \(\d+ due\)$/);
    // No sideways scroll on a phone.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    // Follow up: the sample has due ones, each with its date and the one button.
    const follow = page.getByRole('region', { name: /^Follow up/ });
    const due = follow.getByRole('list', { name: 'Due follow-ups' });
    await expect(due.getByText(/ · Due /).first()).toBeVisible();
    await due
      .getByRole('button', { name: /^Follow up/ })
      .first()
      .click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();

    // Jobs is the Pipeline; from lg, the list beside the first job (#471).
    await page.getByRole('tab', { name: 'Jobs' }).click();
    if (width < 1024)
      await expect(page.getByRole('heading', { level: 1, name: 'Pipeline' })).toBeVisible();
    else await expect(page.getByRole('navigation', { name: 'Jobs' })).toBeVisible();
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
