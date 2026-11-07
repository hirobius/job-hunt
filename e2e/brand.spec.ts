import { test, expect } from '@playwright/test';

// The app bar's animated logo (src/brand/RoleFlame.tsx) burns but never moves the page: its box is
// fixed by the 94x146 viewBox (sized in em) and only the paths inside change, so the header and the
// page height hold still while it does. It loads lazily behind the still wordmark.
test.beforeEach(async ({ context }) => {
  await context.route('https://icons.duckduckgo.com/**', (r) => r.abort());
});

for (const width of [390, 1440]) {
  test(`the header flame holds still at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/#/apply');
    const flame = page.locator('header .rjb-rf > svg');
    await expect(flame).toBeVisible();
    const measure = () =>
      page.evaluate(() => {
        const box = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
        const f = box('header .rjb-rf > svg');
        const h = box('header');
        return [f.x, f.y, f.width, f.height, h.height, document.documentElement.scrollHeight];
      });
    const outer = () => page.locator('header .rjb-rf > svg > path').first().getAttribute('d');
    const first = await measure();
    const shapes = new Set([await outer()]);
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(250);
      expect(await measure()).toEqual(first);
      shapes.add(await outer());
    }
    expect(shapes.size).toBeGreaterThan(3);
  });
}

test('under reduced motion the flame and the letters are still', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#/apply');
  const outer = page.locator('header .rjb-rf > svg > path').first();
  await expect(outer).toBeAttached();
  const d = await outer.getAttribute('d');
  await page.waitForTimeout(500);
  expect(await outer.getAttribute('d')).toBe(d);
  // Every letter at rest: no lean, full opacity.
  const styles = await page
    .locator('header .rjb-rf-l')
    .evaluateAll((ls) => ls.map((l) => (l as HTMLElement).style.cssText));
  expect(styles.length).toBeGreaterThan(0);
  expect(styles.every((s) => /skewX\(0(\.0+)?deg\)/.test(s) && /opacity: 1/.test(s))).toBe(true);
});

test('the boot splash is the flame while the app loads, and React replaces it', async ({
  page,
}) => {
  // Hold the app's entry script (it also holds DOMContentLoaded): the served #root is the splash.
  let release: () => void = () => {};
  const held = new Promise<void>((r) => (release = r));
  await page.route(/\/src\/main\.tsx|\/assets\/index-[^/]*\.js$/, async (route) => {
    await held;
    await route.continue();
  });
  await page.goto('/#/apply', { waitUntil: 'commit' });
  const splash = page.getByRole('status', { name: /^Loading / });
  await expect(splash.locator('.rjb-flame svg path').first()).toBeAttached();
  await expect(page.locator('#root')).not.toContainText('%BRAND');
  release();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('.rjb-boot')).toHaveCount(0);
});

// The logo is the flame, then the name (stacked on sign-in): named for assistive tech by brand.ts,
// its letters flicker while it runs.
test('the logo names the product and flickers: header and sign-in', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/apply');
  const header = page.locator('header .rjb-rf');
  await expect(header.locator('> svg')).toBeVisible();
  await expect(header).toHaveAttribute('role', 'img');
  await expect(header.locator('.rjb-rf-l').first()).toHaveAttribute('style', /skewX/);
  await expect
    .poll(
      () =>
        header
          .locator('.rjb-rf-l')
          .evaluateAll((ls) =>
            ls.some((l) => !/skewX\(0(\.0+)?deg\)/.test((l as HTMLElement).style.cssText)),
          ),
      // Well under the 5 s motion limit (FLAME_MOTION_LIMIT_MS): after it, the letters are at rest.
      { timeout: 2000 },
    )
    .toBe(true);

  await page.getByRole('button', { name: /^Account/ }).click();
  await page.getByRole('menuitem', { name: /^Sign in/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Sign in' });
  const logo = dialog.locator('.rjb-rf[data-layout="stacked"]');
  await expect(logo.locator('> svg')).toBeVisible();
  // Stacked and centred: the flame above the name, both on the column's centre line.
  const [flame, name, column] = await Promise.all([
    logo.locator('> svg').boundingBox(),
    logo.locator('> span').boundingBox(),
    dialog.locator('.rjb-signin-screen__column').boundingBox(),
  ]);
  expect(flame!.y + flame!.height).toBeLessThanOrEqual(name!.y + 1);
  const mid = column!.x + column!.width / 2;
  expect(Math.abs(flame!.x + flame!.width / 2 - mid)).toBeLessThanOrEqual(2);
  expect(Math.abs(name!.x + name!.width / 2 - mid)).toBeLessThanOrEqual(2);
});
