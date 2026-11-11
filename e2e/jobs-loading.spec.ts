// #478: a signed-in device never shows "no jobs" while its cloud copy is on its way. Supabase is
// faked at the network (a stored session); the tracker read is held, then answered or refused.
import { test, expect, type Page, type Route } from '@playwright/test';

const PROJECT = 'nelrcmbkimjjmfmgnixj';
const USER = { id: '00000000-0000-4000-8000-000000000002', email: 'jobs@example.test' }; // pii-allow: fake test address

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

/** Fake Supabase; the tracker read waits for `gate`, then answers with `tracker()`. */
async function fake(page: Page, gate: Promise<void>, tracker: (r: Route) => Promise<void>) {
  await page.route(`https://${PROJECT}.supabase.co/**`, async (route) => {
    const url = route.request().url();
    if (url.includes('/auth/v1/user')) return route.fulfill({ json: USER });
    if (url.includes('/rest/v1/tracker') && route.request().method() === 'GET') {
      await gate;
      return tracker(route);
    }
    return route.fulfill({ json: [] });
  });
}

test.beforeEach(async ({ context }) => {
  await context.route(/^https?:\/\/(?!localhost|nelrcmbkimjjmfmgnixj)/, (r) => r.abort());
});

const blob = (n: number) => ({
  v: 12,
  jobs: Array.from({ length: n }, (_, i) => ({
    url: `https://boards.example.com/role-${i}`,
    label: `Design Systems Role ${i}`,
    company: 'Acme',
    status: 'Saved',
    added: '2026-11-01T00:00:00.000Z',
  })),
});

for (const width of [390, 1440]) {
  test(`while the cloud copy is on its way: "Loading your jobs…", never "no jobs" (${width})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    let release = () => {};
    const gate = new Promise<void>((r) => (release = r));
    await fake(page, gate, (r) =>
      r.fulfill({
        json: [{ user_id: USER.id, data: blob(3), updated_at: new Date().toISOString() }],
      }),
    );
    await signIn(page);
    await page.goto('/#/apply');
    await expect(page.getByText('Loading your jobs…')).toBeVisible({ timeout: 15_000 });
    // Held for a while: still loading, never the first-run empty state.
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(250);
      await expect(page.getByText('Track your first job')).toHaveCount(0);
      await expect(page.getByText(/^0 jobs|To apply · 0 jobs/)).toHaveCount(0);
    }
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.screenshot({ path: `test-results/jobs-loading-${width}-${scheme}.png` });
    }
    release();
    await expect(
      page.getByRole('heading', { level: 1, name: /^Design Systems Role/ }),
    ).toBeVisible();
  });
}

test('a cloud read that fails says the jobs could not load, with Try again (390)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fake(page, Promise.resolve(), (r) => r.fulfill({ status: 503, json: { message: 'down' } }));
  await signIn(page);
  await page.goto('/#/apply');
  await expect(page.getByText("Your jobs couldn't load")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Track your first job')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.screenshot({ path: `test-results/jobs-offline-390-${scheme}.png` });
  }
});
