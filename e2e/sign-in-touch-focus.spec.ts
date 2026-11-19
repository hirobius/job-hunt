// The sign-in screen's first focus (Adrian 2026-11-19): on a touch screen the title, so no
// keyboard rises over Google, LinkedIn and Try a demo; with a mouse the email field. The screen
// opens on its own here, so this spec uses Playwright's own test (as review-sign-in.spec.ts does).
import { test, expect } from '@playwright/test';

const focused = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const a = document.activeElement as HTMLElement;
    return a.tagName === 'INPUT' ? `input:${a.getAttribute('type')}` : a.textContent?.trim();
  });

test.describe('touch screen', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('the title takes focus, not the email field', async ({ page }) => {
    await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
    await page.goto('/#/review');
    await expect(page.getByRole('dialog', { name: 'Sign in' })).toBeVisible();
    await expect.poll(() => focused(page)).toBe('Sign in');
  });
});

test('with a mouse, the email field takes focus', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  await page.goto('/#/review');
  await expect(page.getByRole('dialog', { name: 'Sign in' })).toBeVisible();
  await expect.poll(() => focused(page)).toBe('input:email');
});
