import { test, expect, type Page } from '@playwright/test';

// Sign-in on a phone (2026-10-17): with the iOS keyboard up only ~400px of a 390px-wide phone is
// visible. The sign-in screen (full screen since 2026-10-29) is sized to the visual viewport and
// its brand shrinks smoothly with it, so the field and the button stay in view. At desktop it fills
// the viewport with one centred column.
const openSignIn = async (page: Page) => {
  await page.goto('/#/apply');
  await page.getByRole('button', { name: /^Account/ }).click();
  await page.getByRole('menuitem', { name: /^Sign in/ }).click();
  return page.getByRole('dialog', { name: 'Sign in' });
};

// Company logos come from a third-party icon host; tests never reach it (letters show).
test.beforeEach(async ({ context }) => {
  await context.route('https://icons.duckduckgo.com/**', (r) => r.abort());
});

test('phone with the keyboard up: field and button sit above it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 400 });
  const dialog = await openSignIn(page);
  await expect(page.getByRole('textbox', { name: 'Email' })).toBeFocused();
  const box = (await dialog.boundingBox())!;
  expect(box.y).toBeLessThanOrEqual(24);
  // the screen fills the width from the left edge, never shifted by HDS's centring transform
  expect(box.x).toBe(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.width).toBe(390);
  const button = (await page.getByRole('button', { name: 'Send link' }).boundingBox())!;
  expect(button.y + button.height).toBeLessThanOrEqual(400);
  expect(button.width).toBeGreaterThan(box.width - 64);
});

// Adrian 2026-11-09: when the keyboard opens the brand must not jump (it flipped from large and
// centred to a small row at the top left). The visual viewport shrinks step by step, as a keyboard
// sliding up: the brand stays stacked and centred, and its size eases down with the height.
test('the keyboard opening: the brand stays centred and stacked, and shrinks smoothly', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const dialog = await openSignIn(page);
  const brand = dialog.locator('.rjb-signin-screen__brand');
  const logo = brand.locator('.rjb-rf');
  const read = async () => {
    // Let the size's transition finish (HDS spatial motion) before measuring.
    await page.waitForTimeout(600);
    const [vv, flame, name, size] = await Promise.all([
      page.evaluate(() => window.visualViewport!.height),
      logo.locator('> svg').boundingBox(),
      logo.locator('> span').boundingBox(),
      logo.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
    ]);
    return { vv, flame: flame!, name: name!, size };
  };
  const steps: Awaited<ReturnType<typeof read>>[] = [];
  for (const h of [844, 760, 680, 600, 520, 440, 400]) {
    await page.setViewportSize({ width: 390, height: h });
    steps.push(await read());
  }
  expect(steps[0].vv).toBe(844);
  expect(steps.at(-1)!.vv).toBe(400);
  for (const s of steps) {
    // Stacked: the flame above the name; both centred on the screen.
    expect(s.flame.y + s.flame.height).toBeLessThanOrEqual(s.name.y + 1);
    expect(Math.abs(s.flame.x + s.flame.width / 2 - 195)).toBeLessThanOrEqual(2);
    expect(Math.abs(s.name.x + s.name.width / 2 - 195)).toBeLessThanOrEqual(2);
  }
  expect(steps[0].size).toBe(40);
  expect(steps.at(-1)!.size).toBe(20);
  // Down with the height, never a jump: at most 5px of type for each 80px of screen.
  for (let i = 1; i < steps.length; i++) {
    expect(steps[i].size).toBeLessThanOrEqual(steps[i - 1].size);
    expect(steps[i - 1].size - steps[i].size).toBeLessThanOrEqual(5);
  }
  // Still in view with the keyboard up: the field and Send link.
  const button = (await dialog.getByRole('button', { name: 'Send link' }).boundingBox())!;
  expect(button.y + button.height).toBeLessThanOrEqual(400);
});

test('desktop: a full screen with one centred column', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const dialog = await openSignIn(page);
  const box = (await dialog.boundingBox())!;
  expect(box).toEqual({ x: 0, y: 0, width: 1440, height: 900 });
  const column = (await dialog.locator('.rjb-signin-screen__column').boundingBox())!;
  expect(column.width).toBeLessThanOrEqual(440);
  expect(Math.abs(column.x + column.width / 2 - 720)).toBeLessThanOrEqual(2);
  // The brand sits a fixed share of the screen down (12% of the visible height, clamped), not centred on the step
  // under it, so it never moves between steps (sign-in layout PR).
  const brand = (await dialog.locator('.rjb-signin-screen__brand').boundingBox())!;
  expect(Math.round(brand.y - column.y)).toBeGreaterThanOrEqual(0);
  expect(brand.y).toBeLessThan(900 * 0.2);
  // The brand above the title: the flame (decorative) and the wordmark.
  await expect(dialog.locator('.rjb-rf > svg')).toBeVisible();
  await expect(dialog.locator('.rjb-rf')).toBeVisible();
  await dialog.getByRole('button', { name: 'Continue without an account' }).click();
  await expect(dialog).toBeHidden();
});

const tokenFor = (email: string) => {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return `${b64({ alg: 'HS256' })}.${b64({ sub: 'x', email, exp })}.sig`;
};

// Login injection (security audit): a link carrying someone's session tokens never signs this
// browser in on its own. The tokens leave the address bar at once, and Cancel drops them.
test('an unsolicited token link asks first, and Cancel drops it', async ({ page }) => {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  // A fresh expiry: an expired or expiry-less token is refused outright (security review 2026-10-28).
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = `${b64({ alg: 'HS256' })}.${b64({ sub: 'x', email: 'attacker@evil.test', exp })}.sig`;
  const supabase: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('supabase.co')) supabase.push(r.url());
  });
  await page.goto(`/#access_token=${token}&refresh_token=r&token_type=bearer&type=magiclink`);
  // A full-screen step in the sign-in layout (sign-in layout PR): the brand, the copy, Sign in and Cancel.
  const ask = page.getByRole('dialog', { name: 'Sign in as attacker@evil.test?' }); // pii-allow
  await expect(ask).toBeVisible();
  expect(page.url()).not.toContain('access_token');
  await ask.getByRole('button', { name: 'Cancel' }).click();
  await expect(ask).toBeHidden();
  expect(page.url()).not.toContain('access_token');
  expect(supabase.filter((u) => u.includes('/auth/'))).toEqual([]);
  expect(
    await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('sb-'))),
  ).toEqual([]);
});

// Sign-in layout PR (2026-11-08): the flame and wordmark stay at one place on every step — the
// form, "Check your email", and a link's "Sign in as …?" — at phone and desktop width, light and
// dark (the frames go to test-results for the PR).
for (const [width, height] of [
  [390, 844],
  [1440, 900],
] as const) {
  test(`the brand does not move between steps (${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    // Sending the link answers OK, so the screen moves on to "Check your email".
    await page.route(/supabase\.co\/auth\/v1\/otp/, (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
    );
    await openSignIn(page);
    // The dialog's name follows the step's title: find the brand by its place, not the name.
    const brand = page.locator('.rjb-signin-screen .rjb-signin-screen__brand');
    await expect(brand).toBeVisible();
    const at = async () => {
      const b = (await brand.boundingBox())!;
      return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)];
    };
    const form = await at();
    await page.screenshot({ path: `test-results/signin-form-${width}.png` });
    await page.getByRole('textbox', { name: 'Email' }).fill('me@example.com'); // pii-allow
    await page.getByRole('button', { name: 'Send link' }).click();
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
    expect(await at()).toEqual(form);
    await page.screenshot({ path: `test-results/signin-check-${width}.png` });
    // The embers float above the brand without taking room: its box holds still while it burns.
    for (let i = 0; i < 5; i++) {
      await page.waitForTimeout(120);
      expect(await at()).toEqual(form);
    }
    // A link this browser did not ask for: "Sign in as …?" is a step of the same screen, its
    // brand at the same place.
    // A fresh load: a token link is read once, as the app starts.
    await page.goto('about:blank');
    await page.goto(
      `/#access_token=${tokenFor('someone@example.test')}&refresh_token=r&token_type=bearer&type=magiclink`, // pii-allow
    );
    await expect(
      page.getByRole('heading', { name: 'Sign in as someone@example.test?' }), // pii-allow
    ).toBeVisible();
    expect(await at()).toEqual(form);
    await page.screenshot({ path: `test-results/signin-confirm-${width}.png` });
    // Sign in: "Signing in…" until the session is real (the auth server answers for this user
    // here), then a short "Signed in", the brand moves to the app bar and the screen goes.
    await page.route(/supabase\.co\/auth\/v1\/user/, (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'x', aud: 'authenticated', email: 'someone@example.test' }), // pii-allow
      }),
    );
    await page.route(/supabase\.co\/rest\//, (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    );
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { name: 'Signed in' })).toBeVisible();
    await page.screenshot({ path: `test-results/signin-done-${width}.png` });
    await page.waitForTimeout(600 + 150);
    await page.screenshot({ path: `test-results/signin-moving-${width}.png` });
    await expect(page.locator('.rjb-signin-screen')).toHaveCount(0, { timeout: 3000 });
    // Focus lands on the page's own h1, never on <body> (#516 review).
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.matches('main h1') ?? false))
      .toBe(true);
  });
}

// #515 review: "Signed in" only for a real session. A link the auth server refuses stays on the
// confirm step with the reason in place.
test('a refused link stays on the confirm step with the reason, never "Signed in"', async ({
  page,
}) => {
  await page.route(/supabase\.co\/auth\/v1\/user/, (r) =>
    r.fulfill({ status: 401, contentType: 'application/json', body: '{"message":"bad jwt"}' }),
  );
  await page.goto(
    `/#access_token=${tokenFor('someone@example.test')}&refresh_token=r&token_type=bearer&type=magiclink`, // pii-allow
  );
  const ask = page.getByRole('dialog', { name: 'Sign in as someone@example.test?' }); // pii-allow
  await expect(ask).toBeVisible();
  await ask.getByRole('button', { name: 'Sign in' }).click();
  await expect(ask.getByRole('alert')).toContainText('That sign-in link could not be used.');
  await expect(page.getByRole('heading', { name: 'Signed in' })).toHaveCount(0);
  await page.screenshot({ path: 'test-results/signin-refused-390.png' });
});
