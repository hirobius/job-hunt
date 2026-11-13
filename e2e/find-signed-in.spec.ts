// Find shows no status text above Browse / Deck (Adrian 2026-11-08). Signed in, the server syncs
// every 15 minutes: no Scan now; "Updated N min ago" from the last sync_log run is in Scan details
// (the Account menu's Search profile, #549). Signed out, one compact Scan now beside the Review new heading. Supabase is faked at the network:
// a stored session, an empty cloud copy and a sync_log run 4 minutes ago.
import { test, expect, type Page } from '@playwright/test';
import { openScanDetails } from './routes';

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
    // No postings yet: the empty state, never the List | Deck toggle alone (Adrian 2026-11-13).
    await expect(page.getByRole('region', { name: 'No postings' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('button', { name: /^View: / })).toHaveCount(0);
    await page.waitForTimeout(1500);
    await expect(page.getByRole('button', { name: /^(Scan now|Stop scan)$/ })).toHaveCount(0);
    await expect(
      page.getByText(
        /^Updated |^Not scanned|^Read \d+ of \d+ boards$|unavailable · details|^Not shown/,
      ),
    ).toHaveCount(0);
    // No scan line and no More on Find (#694). The Account menu holds Search profile and, signed
    // in, no Scan now (the server syncs every 15 minutes).
    await expect(page.getByText(/^Scanned /)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^More: scan/ })).toHaveCount(0);
    await page.getByRole('button', { name: /^Account/ }).click();
    await expect(page.getByRole('menuitem', { name: 'Search profile' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /^(Scan now|Stop scan)$/ })).toHaveCount(0);
    await page.keyboard.press('Escape');
    const details = await openScanDetails(page);
    await expect(details.getByText('Updated 4 min ago')).toBeVisible();
  });
}

// #694: no More menu on Find. Scan now (signed out) sits in the Account menu beside Search profile;
// the Review row's right side is List | Deck alone (no Sort since 2026-11-13). No Scan now key on the page.
test('signed out: Scan now is in the Account menu, beside Search profile (390)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/find');
  const review = page.getByRole('region', { name: /^New postings$/ });
  await expect(review.getByRole('region', { name: 'No postings' })).toBeVisible({
    timeout: 15_000,
  });
  // No postings shown: no List | Deck toggle (Adrian 2026-11-13).
  await expect(review.getByRole('button', { name: /^View: / })).toHaveCount(0);
  // No Scan now key on the page outside the empty state's own key (#694).
  const empty = review.getByRole('region', { name: 'No postings' });
  await expect(page.getByRole('button', { name: 'Scan now' })).toHaveCount(
    await empty.getByRole('button', { name: 'Scan now' }).count(),
  );
  await expect(page.getByRole('button', { name: /^More: scan/ })).toHaveCount(0);
  // The h1 stays for screen readers (sr-only).
  await expect(page.getByRole('heading', { level: 1, name: 'Find' })).toHaveClass(/sr-only/);
  await page.getByRole('button', { name: /^Account/ }).click();
  // The rows are their own chunk: wait for them.
  await expect(page.getByRole('menuitem', { name: 'Scan now' })).toBeVisible();
  const items = page.getByRole('menu').getByRole('menuitem');
  const names = await items.allInnerTexts();
  const at = names.findIndex((n) => n.trim() === 'Search profile');
  expect(names[at + 1]?.trim()).toBe('Scan now');
  // The scan line is Scan details' alone: none in the menu.
  await expect(page.getByRole('menu').getByText(/^Scanned |^Last scanned/)).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByText(/^Updated |^Not scanned|^Sign in for automatic/)).toHaveCount(0);
});
