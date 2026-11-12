// Find shows no status text above Browse / Deck (Adrian 2026-11-08). Signed in, the server syncs
// every 15 minutes: no Scan now; "Updated N min ago" from the last sync_log run is in the Account
// menu's Scan details. Signed out, one compact Scan now beside the Review new heading. Supabase is faked at the network:
// a stored session, an empty cloud copy and a sync_log run 4 minutes ago.
import { test, expect, type Page } from '@playwright/test';

const PROJECT = 'nelrcmbkimjjmfmgnixj';
const USER = { id: '00000000-0000-4000-8000-000000000001', email: 'find@example.test' }; // pii-allow: fake test address

async function fakeSupabase(page: Page, ranAt: string | null) {
  await page.route(`https://${PROJECT}.supabase.co/**`, async (route) => {
    const url = route.request().url();
    if (url.includes('/auth/v1/user')) return route.fulfill({ json: USER });
    if (url.includes('/rest/v1/sync_log'))
      return route.fulfill({ json: ranAt ? [{ created_at: ranAt }] : [] });
    // Every other read is empty: no cloud copy, no postings, no picks.
    return route.fulfill({ json: [] });
  });
}

async function signIn(page: Page) {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = `${b64({ alg: 'HS256' })}.${b64({ sub: USER.id, email: USER.email, exp })}.sig`;
  await page.addInitScript(
    ([key, session]) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, session);
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
    ] as const,
  );
}

test.beforeEach(async ({ context }) => {
  await context.route(/^https?:\/\/(?!localhost|nelrcmbkimjjmfmgnixj)/, (r) => r.abort());
});

for (const width of [390, 1440]) {
  test(`signed in: no Scan now or status text; Scan details says when it updated (${width})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await fakeSupabase(page, new Date(Date.now() - 4 * 60_000).toISOString());
    await signIn(page);
    await page.goto('/#/find');
    await expect(page.getByRole('button', { name: 'Browse' })).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1500);
    await expect(page.getByRole('button', { name: /^(Scan now|Stop scan)$/ })).toHaveCount(0);
    await expect(
      page.getByText(
        /^Updated |^Not scanned|^Read \d+ of \d+ boards$|unavailable · details|^Not shown/,
      ),
    ).toHaveCount(0);
    await page.getByRole('button', { name: 'Account' }).click();
    await page.getByRole('menuitem', { name: 'Scan details' }).click();
    const details = page.getByRole('dialog', { name: 'Scan details' });
    await expect(details.getByText('Updated 4 min ago')).toBeVisible();
  });
}

test('signed out: one compact Scan now beside the Review new heading (390)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/find');
  const review = page.getByRole('region', { name: /^Review\b/ });
  await expect(review.getByRole('button', { name: 'Scan now' })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Scan now' })).toHaveCount(1);
  const heading = await review.getByRole('heading', { name: 'Review' }).boundingBox();
  const button = await review.getByRole('button', { name: 'Scan now' }).boundingBox();
  // On the heading's row.
  expect(
    Math.abs(heading!.y + heading!.height / 2 - (button!.y + button!.height / 2)),
  ).toBeLessThan(8);
  await expect(page.getByText(/^Updated |^Not scanned|^Sign in for automatic/)).toHaveCount(0);
});
