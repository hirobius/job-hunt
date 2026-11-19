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

test('Apply in a demo tab shows the note, and Leave demo works from there (#837 review)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  await page.goto('/#/review?demo=1');
  await expect(page.getByText('This is a demo')).toBeVisible();
  await page.goto('/#/apply');
  await expect(page.getByText('This is a demo')).toBeVisible();
  await expect(page.locator('main h1')).toHaveCount(1);
  await page.getByRole('button', { name: 'Leave demo' }).click();
  await expect(page).toHaveURL(/#\/review$/);
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('rjb_demo'))).toBeNull();
});

// A stored Supabase session never gets the demo: its sync would run against the demo's data.
const PROJECT = 'nelrcmbkimjjmfmgnixj';
const USER = { id: '00000000-0000-4000-8000-000000000003', email: 'demo@example.test' }; // pii-allow: fake test address

test('with a stored session, a ?demo=1 link opens no demo and leaves the data as it was (#837 review)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(/^https?:\/\/(?!localhost|nelrcmbkimjjmfmgnixj)/, (r) => r.abort());
  const mine = {
    url: 'https://mine.example/jobs/2',
    label: 'My signed-in job',
    status: 'Saved',
    added: '2026-11-01T00:00:00.000Z',
  };
  await page.route(`https://${PROJECT}.supabase.co/**`, (route) => {
    const url = route.request().url();
    if (url.includes('/auth/v1/user')) return route.fulfill({ json: USER });
    if (url.includes('/rest/v1/tracker') && route.request().method() === 'GET')
      return route.fulfill({
        json: [
          { user_id: USER.id, data: { v: 12, jobs: [mine] }, updated_at: new Date().toISOString() },
        ],
      });
    return route.fulfill({ json: [] });
  });
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = `${b64({ alg: 'HS256' })}.${b64({ sub: USER.id, email: USER.email, exp })}.sig`;
  await page.addInitScript(
    ([key, session, jobs]) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, session);
      if (!localStorage.getItem('rjb_shortlist')) localStorage.setItem('rjb_shortlist', jobs);
    },
    [
      `sb-${PROJECT}-auth-token`,
      JSON.stringify({
        access_token: token,
        refresh_token: 'r',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: exp,
        user: { ...USER, aud: 'authenticated', role: 'authenticated' },
      }),
      JSON.stringify([mine]),
    ] as const,
  );
  await page.goto('/#/review?demo=1');
  await expect(page.locator('main h1')).toHaveCount(1);
  await page.waitForTimeout(1000); // a demo would have swapped in and seeded by now
  await expect(page.getByText('This is a demo')).toHaveCount(0);
  await expect(page.getByText('Larkspur Analytics')).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem('rjb_demo'))).toBeNull();
  await page.goto('/#/apply');
  await expect(page.getByText('My signed-in job').first()).toBeVisible();
  await expect(page.getByText('This is a demo')).toHaveCount(0);
  const stored = await page.evaluate(() => localStorage.getItem('rjb_shortlist') ?? '');
  expect(stored).toContain('https://mine.example/jobs/2');
  expect(stored).not.toContain('demo');
});
