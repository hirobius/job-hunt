// The sign-in screen opens on its own here, so this spec uses Playwright's own test, as
// review-sign-in.spec.ts does (fixtures.ts skips that ask for every other spec).
import { test, expect } from '@playwright/test';

// The demo (#835, Adrian 2026-11-19): the sign-in screen's grey Try a demo key, and a ?demo=1 link.
// Adrian's condition: the whole screen fits a 390x844 phone with no scroll.

test('the sign-in screen, with Try a demo, fits 390x844 with no scroll', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  await page.goto('/#/review');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Try a demo' })).toBeVisible();
  const fit = await dialog.evaluate((d) => {
    const scroller = [...d.querySelectorAll<HTMLElement>('*')].find(
      (e) =>
        e.scrollHeight > e.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(e).overflowY),
    );
    const legal = [...d.querySelectorAll('p')].at(-1)!.getBoundingClientRect();
    return {
      scroll: scroller ? scroller.scrollHeight - scroller.clientHeight : 0,
      bottom: legal.bottom,
    };
  });
  expect(fit.scroll).toBe(0);
  expect(fit.bottom).toBeLessThanOrEqual(844);
});

test('Try a demo on the sign-in screen opens Review with sample postings', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  await page.goto('/#/review');
  await page.getByRole('dialog').getByRole('button', { name: 'Try a demo' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/#\/review$/);
  await expect(page.getByText('This is a demo')).toBeVisible();
});

test('a ?demo=1 link opens the demo, with no sign-in screen, and leaves a clean URL', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  await page.goto('/#/review?demo=1');
  await expect(page.getByText('This is a demo')).toBeVisible();
  await expect(page).toHaveURL(/#\/review$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
