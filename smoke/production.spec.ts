import { test, expect, type Page } from '@playwright/test';

// Post-deploy smoke test (#595). Runs against the live site (playwright.smoke.config.ts,
// SMOKE_URL), signed out, in a fresh browser: nothing is saved, no link is sent, no account is
// touched. It checks that the app loads, the flame logo draws, Find, Apply and the sign-in screen
// open, and that no page error or console error shows on the way. Runbook and rollback:
// docs/ci/smoke-and-rollback.md.

/** Third-party hosts the smoke never reaches: analytics would count the run as a visit, and a
 * company logo host can be slow. Answered empty (204), so the browser logs no error for them. */
const QUIET = [/\/_vercel\/(insights|speed-insights)\//, /^https:\/\/icons\.duckduckgo\.com\//];

/** Console lines that are not app errors. Keep this list short and explain each line. */
const ALLOWED_CONSOLE: RegExp[] = [];

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    if (ALLOWED_CONSOLE.some((r) => r.test(text))) return;
    errors.push(`console: ${text} (${m.location().url})`);
  });
  page.on('response', (r) => {
    // A missing chunk or stylesheet of our own is a broken deploy.
    const url = r.url();
    if (r.status() >= 400 && new URL(url).origin === new URL(page.url() || url).origin) {
      errors.push(`${r.status()} ${url}`);
    }
  });
  return errors;
}

test.beforeEach(async ({ context }) => {
  for (const pattern of QUIET) {
    await context.route(pattern, (r) => r.fulfill({ status: 204, body: '' }));
  }
});

for (const width of [390, 1440]) {
  test.describe(`at ${width}`, () => {
    test.use({ viewport: { width, height: width === 390 ? 844 : 900 } });

    test('the app loads on Find with the flame logo', async ({ page }) => {
      const errors = watchErrors(page);
      const res = await page.goto('/');
      expect(res?.status()).toBe(200);
      await expect(page).toHaveURL(/#\/find$/);
      await expect(page.getByRole('heading', { level: 1, name: 'Find' })).toBeVisible();
      await expect(page).toHaveTitle(/roleflame/i);
      // The header's wordmark: the flame's three paths drawn, with real path data.
      const flame = page.locator('header .rjb-wordmark-flame path, header .rjb-rf path');
      await expect(flame.first()).toBeAttached();
      expect(await flame.first().getAttribute('d')).toMatch(/^M/);
      await expect(page.getByRole('navigation', { name: 'Sections' }).getByRole('link')).toHaveText(
        [/^Find( \d+\+?)?$/, /^Apply( \d+\+?)?$/],
      );
      await expect(page.getByRole('region', { name: /^Review\b/ })).toBeVisible();
      expect(errors).toEqual([]);
    });

    test('Apply opens', async ({ page }) => {
      const errors = watchErrors(page);
      await page.goto('/#/apply');
      await expect(page.getByRole('heading', { level: 1, name: 'Apply' })).toBeVisible();
      // A fresh browser has no jobs: the empty state's filled key.
      await expect(
        page
          .getByRole('button', { name: 'Track your first job' })
          .or(page.getByRole('button', { name: 'Add job' }))
          .first(),
      ).toBeVisible();
      expect(errors).toEqual([]);
    });

    test('the sign-in screen opens (no link is sent)', async ({ page }) => {
      const errors = watchErrors(page);
      await page.goto('/#/find');
      await page.getByRole('button', { name: /^Account/ }).click();
      await page.getByRole('menuitem', { name: /^Sign in/ }).click();
      const dialog = page.getByRole('dialog', { name: 'Sign in' });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('textbox', { name: 'Email' })).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Send link' })).toBeVisible();
      await expect(dialog.locator('.rjb-rf path').first()).toBeAttached();
      expect(errors).toEqual([]);
    });

    test('Privacy and terms opens over Find', async ({ page }) => {
      const errors = watchErrors(page);
      await page.goto('/#/find?legal=privacy');
      await expect(page.getByRole('dialog', { name: 'Privacy and terms' })).toBeVisible();
      expect(errors).toEqual([]);
    });
  });
}
