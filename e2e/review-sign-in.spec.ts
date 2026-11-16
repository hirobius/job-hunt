// Review requires sign-in (#755, Adrian 2026-11-15): signed out, the sign-in screen opens over
// Review, which holds one line and one filled key, Sign in. No feed, board, posting or Supabase
// postings read leaves the browser, no scan runs, the Account menu has no Scan now and the Review
// tab has no count. Continue without an account leaves the person on that line, with Apply one tap
// away; Back closes the sign-in screen.
import { test, expect, type Page, type Request } from '@playwright/test';

/** Every request that is not the app's own (the dev server) or the HDS icon host. */
function outside(page: Page): Request[] {
  const seen: Request[] = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.hostname === 'localhost' || u.protocol === 'data:' || u.protocol === 'blob:') return;
    seen.push(r);
  });
  return seen;
}

test.beforeEach(async ({ context }) => {
  // Nothing leaves for real; every outside request is still seen by `outside`.
  await context.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
});

for (const width of [390, 1440]) {
  for (const hash of ['', '#/review', '#/review/gh-acme-1']) {
    test(`signed out at "${hash || '/'}": the sign-in screen, no reads (${width})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      const requests = outside(page);
      await page.goto(`/${hash}`);
      const dialog = page.getByRole('dialog', { name: 'Sign in' });
      await expect(dialog).toBeVisible();
      await page.getByRole('button', { name: 'Continue without an account' }).click();
      await expect(dialog).toHaveCount(0);
      await expect(page.getByRole('heading', { level: 1, name: 'Review' })).toHaveCount(1);
      await expect(page.locator('main h1')).toHaveCount(1);
      await expect(page.getByText('Sign in to see new postings.')).toBeVisible();
      await expect(page.getByRole('list', { name: 'New postings' })).toHaveCount(0);
      // Focus is never on the body after the screen closes.
      expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);
      // No count on the Review tab.
      const nav = page.getByRole('navigation', { name: 'Sections' });
      await expect(nav.getByRole('link', { name: 'Review', exact: true })).toBeVisible();
      // Give a late read or a scan timer the time it would take to start.
      await page.waitForTimeout(2500);
      expect(requests.map((r) => r.url())).toEqual([]);
      // No Scan now in the Account menu.
      await page.getByRole('button', { name: /^Account/ }).click();
      await expect(page.getByRole('menuitem', { name: 'Search profile' })).toBeVisible();
      await expect(page.getByRole('menuitem', { name: /^(Scan now|Stop scan)$/ })).toHaveCount(0);
      await page.keyboard.press('Escape');
      // Apply is one tap away.
      await nav.getByRole('link', { name: 'Apply' }).click();
      await expect(page).toHaveURL(/#\/apply$/);
    });
  }
}

test('signed out: the Sign in key opens the screen again, and Back closes it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/review');
  const dialog = page.getByRole('dialog', { name: 'Sign in' });
  await expect(dialog).toBeVisible();
  await page.goBack();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/#\/review$/);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(dialog).toBeVisible();
  await page.goBack();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Sign in to see new postings.')).toBeVisible();
});

test('signed out: Try a demo loads the sample jobs here and opens Apply, with no reads', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const requests = outside(page);
  await page.goto('/#/review');
  await page.getByRole('button', { name: 'Continue without an account' }).click();
  const demo = page.getByRole('button', { name: 'Try a demo' });
  await expect(demo).toHaveAttribute('data-variant', 'secondary');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toHaveAttribute(
    'data-variant',
    'primary',
  );
  await demo.click();
  await expect(page).toHaveURL(/#\/apply$/);
  await expect(page.locator('a[href^="#/apply/"]').first()).toBeVisible();
  await page.waitForTimeout(1500);
  expect(requests.map((r) => r.url())).toEqual([]);
});
