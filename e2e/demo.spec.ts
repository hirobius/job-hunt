// The sign-in screen opens on its own here, so this spec uses Playwright's own test, as
// review-sign-in.spec.ts does (fixtures.ts skips that ask for every other spec).
import { test, expect } from '@playwright/test';
import { PROD_URL } from './routes';

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

// The production build too: there the demo module loads late, after Review would ask for sign-in.
for (const [where, base] of [
  ['dev', ''],
  ['production build', PROD_URL],
] as const) {
  test(`a ?demo=1 link opens the demo, with no sign-in screen, and leaves a clean URL (${where})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
    await page.goto(`${base}/#/review?demo=1`);
    await expect(page.getByText('This is a demo')).toBeVisible();
    await expect(page).toHaveURL(/#\/review$/);
    await page.waitForTimeout(1000); // a late sign-in screen would open by now
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
}

test('a demo round trip leaves the visitor’s own data exactly as it was (#835 review)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  // A visitor with a real job on this device.
  await page.goto('/#/apply');
  const mine = [{ url: 'https://mine.example/jobs/1', label: 'My real job', status: 'Saved' }];
  await page.evaluate((jobs) => {
    localStorage.setItem('rjb_shortlist', JSON.stringify(jobs));
    sessionStorage.setItem('rjb_sign_in_asked', '1');
  }, mine);
  const before = await page.evaluate(() => localStorage.getItem('rjb_shortlist'));

  // The demo: the visitor's job is not in it, and a Save stays in the demo.
  await page.goto('/#/review?demo=1');
  await page.reload();
  await expect(page.getByText('This is a demo')).toBeVisible();
  const list = page.getByRole('list', { name: 'New postings' });
  await list.getByRole('button', { name: /^Save/ }).first().click();
  await page.goto('/#/apply');
  await expect(page.getByText('My real job')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('rjb_shortlist'))).not.toBe(before);

  // Leave demo: back to the sign-in screen, and the real store never changed.
  await page.goto('/#/review');
  await page.getByRole('button', { name: 'Leave demo' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Continue without an account' }).click();
  await page.reload();
  await expect(page.getByText('This is a demo')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('rjb_shortlist'))).toBe(before);
  await page.goto('/#/apply');
  await expect(page.getByText('My real job').first()).toBeVisible();
  await expect(page.getByText('Larkspur Analytics')).toHaveCount(0);
});
