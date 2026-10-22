import { test, expect, type Page } from '@playwright/test';

// Sign-in on a phone (2026-10-17): with the iOS keyboard up only ~400px of a 390px-wide phone is
// visible. The dialog is a sheet pinned to the top of the visual viewport, so the field and the
// button stay in view. At desktop it stays a centred dialog.
const openSignIn = async (page: Page) => {
  await page.goto('/#/queue');
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
  const button = (await page.getByRole('button', { name: 'Continue with email' }).boundingBox())!;
  expect(button.y + button.height).toBeLessThanOrEqual(400);
  expect(button.width).toBeGreaterThan(box.width - 64);
});

test('desktop: a centred dialog', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const dialog = await openSignIn(page);
  const box = (await dialog.boundingBox())!;
  expect(Math.abs(box.y + box.height / 2 - 450)).toBeLessThanOrEqual(2);
  expect(box.width).toBeLessThanOrEqual(440);
});

// Login injection (security audit): a link carrying someone's session tokens never signs this
// browser in on its own. The tokens leave the address bar at once, and Cancel drops them.
test('an unsolicited token link asks first, and Cancel drops it', async ({ page }) => {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const token = `${b64({ alg: 'HS256' })}.${b64({ sub: 'x', email: 'attacker@evil.test' })}.sig`;
  const supabase: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('supabase.co')) supabase.push(r.url());
  });
  await page.goto(`/#access_token=${token}&refresh_token=r&token_type=bearer&type=magiclink`);
  const ask = page.getByRole('alertdialog', { name: 'Sign in as attacker@evil.test?' });
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
