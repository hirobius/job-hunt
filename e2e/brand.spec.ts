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
  // The splash burns before the app's entry lands: the live fire, a new frame each time.
  const outer = splash.locator('.rjb-flame svg .flame-1');
  const seen = new Set<string>();
  await expect
    .poll(async () => seen.add((await outer.getAttribute('d')) ?? '').size, { timeout: 5000 })
    .toBeGreaterThan(3);
  release();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('.rjb-boot')).toHaveCount(0);
});

// The logo is the flame, then the name (stacked on sign-in): named for assistive tech by brand.ts,
// its letters stand still while the flame burns (Adrian 2026-11-10: the flicker is off).
test('the logo names the product, the letters still: header and sign-in', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/apply');
  const header = page.locator('header .rjb-rf');
  await expect(header.locator('> svg')).toBeVisible();
  await expect(header).toHaveAttribute('role', 'img');
  const letterPoses = () =>
    header
      .locator('.rjb-rf-l')
      .evaluateAll((ls) => ls.map((l) => (l as HTMLElement).style.cssText));
  const first = await letterPoses();
  for (const pose of first) expect(pose).toMatch(/skewX\(0(\.0+)?deg\)/);
  await page.waitForTimeout(600);
  expect(await letterPoses()).toEqual(first);

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

// Adrian 2026-11-08: the app bar's flame loops on; under reduced motion it is still from the start.
// Since 2026-11-09 no flame stops on its own (the sign-in screen's had a 5 s limit).
test('the app bar flame keeps burning after 5 s, and is still under reduced motion', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#/find');
  // The flame's first layer (its d holds the embers too, so it changes every frame).
  const path = page.locator('header .rjb-rf > svg path').first();
  await expect(path).toBeAttached();
  await page.waitForTimeout(5600);
  const a = await path.getAttribute('d');
  await expect.poll(() => path.getAttribute('d'), { timeout: 2000 }).not.toBe(a);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  // Under reduced motion the logo may stay the still wordmark: either way nothing moves.
  const any = page.locator('header [role="img"] svg path').first();
  await expect(any).toBeAttached();
  await page.waitForTimeout(300);
  const still = await any.getAttribute('d');
  await page.waitForTimeout(800);
  expect(await any.getAttribute('d')).toBe(still);
});

test('the sign-in flame keeps burning after 5 s too (Adrian 2026-11-09)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/find');
  await page.getByRole('button', { name: /^Account/ }).click();
  await page.getByRole('menuitem', { name: /^Sign in/ }).click();
  const path = page.locator('.rjb-signin-screen .rjb-rf > svg path').first();
  await expect(path).toBeAttached();
  await page.waitForTimeout(5600);
  const a = await path.getAttribute('d');
  await expect.poll(() => path.getAttribute('d'), { timeout: 2000 }).not.toBe(a);
});

// #519 review (WCAG 2.2.2): the sign-in screen has its own Pause / Play, the Account menu's choice.
test('the sign-in screen pauses the flame and its size easing, and plays it again', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/find');
  await page.getByRole('button', { name: /^Account/ }).click();
  await page.getByRole('menuitem', { name: /^Sign in/ }).click();
  const screenEl = page.locator('.rjb-signin-screen');
  const path = screenEl.locator('.rjb-rf > svg path').first();
  const toggle = screenEl.getByRole('button', { name: 'Pause animations' });
  // At the top right corner.
  const box = (await toggle.boundingBox())!;
  expect(box.x + box.width).toBeGreaterThan(390 - 24);
  expect(box.y).toBeLessThan(24);
  await toggle.click();
  await expect(screenEl.getByRole('button', { name: 'Play animations' })).toBeVisible();
  const still = await path.getAttribute('d');
  await page.waitForTimeout(800);
  expect(await path.getAttribute('d')).toBe(still);
  const transition = await screenEl
    .locator('.rjb-signin-screen__brand .rjb-rf')
    .evaluate((el) => getComputedStyle(el).transitionDuration);
  expect(transition).toBe('0s');
  await screenEl.getByRole('button', { name: 'Play animations' }).click();
  await expect.poll(() => path.getAttribute('d'), { timeout: 2000 }).not.toBe(still);
});

// Retro quick wins (2026-11-08): the app bar's flame throws embers ~21px over the logo; they stay on
// screen (with 24px over the bar they ran off the top of a phone).
for (const width of [390, 1440]) {
  test(`the app bar's embers stay on screen at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
    await page.goto('/#/find');
    await page.locator('header .rjb-rf svg').first().waitFor();
    let top = Infinity;
    for (let i = 0; i < 30; i++) {
      top = Math.min(
        top,
        await page.evaluate(() => {
          let t = Infinity;
          document
            .querySelectorAll('header .rjb-rf svg path')
            .forEach((p) => (t = Math.min(t, p.getBoundingClientRect().top)));
          return t;
        }),
      );
      await page.waitForTimeout(100);
    }
    expect(top).toBeGreaterThanOrEqual(0);
  });
}

// WCAG 2.2.2 (#516): Pause animations in the Account menu stops the looping flame, and the choice
// is kept on this device.
test('Pause animations stops the app bar flame and is kept after a reload', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#/find');
  const path = page.locator('header .rjb-rf > svg path').first();
  await expect(path).toBeAttached();
  await page.getByRole('button', { name: 'Account' }).click();
  const toggle = page.getByRole('menuitemcheckbox', { name: 'Pause animations' });
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await toggle.click();
  // A toggle (#549): the menu stays open and the switch shows the new state.
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  const still = await path.getAttribute('d');
  await page.waitForTimeout(800);
  expect(await path.getAttribute('d')).toBe(still);
  await page.reload();
  await expect(path).toBeAttached();
  const after = await path.getAttribute('d');
  await page.waitForTimeout(800);
  expect(await path.getAttribute('d')).toBe(after);
  await page.getByRole('button', { name: 'Account' }).click();
  await expect(page.getByRole('menuitemcheckbox', { name: 'Pause animations' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
});

// The logo is the home link (#620): named for the product and Find, a 44px target on a phone, and a
// tap opens Find at its root from anywhere; the animated logo stays inside it.
test('the logo links home to Find (#620)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  await page.goto('/#/apply');
  const home = page.getByRole('banner').getByRole('link', { name: 'roleflame, Find' });
  await expect(home.locator('.rjb-rf > svg')).toBeVisible();
  const box = await home.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.width).toBeGreaterThanOrEqual(44);
  await home.click();
  await expect(page).toHaveURL(/#\/find$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Find' })).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Sections' }).locator('a[aria-current="page"]'),
  ).toHaveText(/^Find/);
});

// #556: the stacked flame (sign-in) is centred by mass. RoleFlame.tsx's nudge assumes the name's
// ink centre sits NAME_INK_OFFSET_EM (0.011em) right of its box centre in Sora 800: measure it in
// the browser, and check the nudge is on the stacked flame and not on the app bar's row.
test('the sign-in flame takes its mass nudge; the app bar row its own drop (#639)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/apply');
  await page.getByRole('button', { name: /^Account/ }).click();
  await page.getByRole('menuitem', { name: /^Sign in/ }).click();
  const stacked = page.locator('.rjb-signin-screen__brand .rjb-rf[data-layout="stacked"] > svg');
  await expect(stacked).toBeVisible();
  expect(await stacked.evaluate((el) => (el as SVGElement).style.transform)).toBe(
    'translateX(0.0044em)',
  );
  const ink = await page.evaluate(async () => {
    await document.fonts.load('800 40px "Roleflame Sora"');
    const c = document.createElement('canvas').getContext('2d')!;
    c.font = '800 40px "Roleflame Sora"';
    const m = c.measureText('Roleflame');
    return ((m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2 - m.width / 2) / 40;
  });
  expect(Math.abs(ink - 0.011)).toBeLessThan(0.003);
  await page.keyboard.press('Escape');
  const row = page.locator('header .rjb-rf[data-layout="inline"] > svg');
  await expect(row).toBeVisible();
  expect(await row.evaluate((el) => (el as SVGElement).style.transform)).toBe(
    'translateY(0.152em)',
  );
  // RoleFlame.tsx's X_HEIGHT_CENTRE_EM: Sora 800's x-height centre below a line-height 1 box centre.
  const xCentre = await page.evaluate(async () => {
    await document.fonts.load('800 100px "Roleflame Sora"');
    const c = document.createElement('canvas').getContext('2d')!;
    c.font = '800 100px "Roleflame Sora"';
    const m = c.measureText('x');
    const top =
      -m.fontBoundingBoxAscent + (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent - 100) / 2;
    return (-m.actualBoundingBoxAscent / 2 - (top + 50)) / 100;
  });
  expect(Math.abs(xCentre - 0.06)).toBeLessThan(0.01);
  // The drop is a transform: the flame's box stays centred on the name's line, so the bar never moves.
  const centres = await page.locator('header .rjb-rf[data-layout="inline"]').evaluate((el) => {
    const svg = el.querySelector('svg')!;
    const name = el.querySelector('svg + span')!;
    const box = svg.getBoundingClientRect();
    const drop = parseFloat(getComputedStyle(svg).fontSize) * 0.152;
    const text = name.getBoundingClientRect();
    return { flame: box.top - drop + box.height / 2, name: text.top + text.height / 2 };
  });
  expect(Math.abs(centres.flame - centres.name)).toBeLessThan(1);
});
