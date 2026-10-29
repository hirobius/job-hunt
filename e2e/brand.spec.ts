import { test, expect } from '@playwright/test';

// The flame burns (Version E, flameMotion.ts) but never moves the page: its box is fixed by
// flame.svg's viewBox and only the paths inside change, so the header and the page height hold
// still while it does.
test.beforeEach(async ({ context }) => {
  await context.route('https://icons.duckduckgo.com/**', (r) => r.abort());
});

for (const width of [390, 1440]) {
  test(`the header flame holds still at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/#/queue');
    const flame = page.locator('header .rjb-flame svg');
    await expect(flame).toBeVisible();
    const measure = () =>
      page.evaluate(() => {
        const box = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
        const f = box('header .rjb-flame svg');
        const h = box('header');
        return [f.x, f.y, f.width, f.height, h.height, document.documentElement.scrollHeight];
      });
    const outer = () => page.locator('header .flame-1').getAttribute('d');
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
  await page.goto('/#/queue');
  const outer = page.locator('header .flame-1');
  const d = await outer.getAttribute('d');
  await page.waitForTimeout(500);
  expect(await outer.getAttribute('d')).toBe(d);
  const styles = await page
    .locator('header .rjb-wordmark-l')
    .evaluateAll((ls) => ls.map((l) => (l as HTMLElement).style.cssText));
  expect(styles.every((s) => s === '')).toBe(true);
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
  await page.goto('/#/queue', { waitUntil: 'commit' });
  const splash = page.getByRole('status', { name: /^Loading / });
  await expect(splash.locator('.rjb-flame svg path').first()).toBeAttached();
  await expect(page.locator('#root')).not.toContainText('%BRAND');
  release();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('.rjb-boot')).toHaveCount(0);
});

// The wordmark's box is plain text's (the "o" stays in the line, the flame over it; each letter its
// own box for the flicker): width and height within 1px of the bare name in the same element
// style, in the header and on sign-in, measured while the letters flicker.
async function compareToPlain(page: import('@playwright/test').Page, selector: string) {
  return page.evaluate((sel) => {
    const word = document.querySelector(sel) as HTMLElement;
    const plain = document.createElement(word.tagName === 'H1' ? 'h1' : 'p');
    plain.className = word.className;
    plain.textContent = word.getAttribute('aria-label');
    plain.style.position = 'absolute';
    plain.style.visibility = 'hidden';
    word.parentElement!.appendChild(plain);
    const a = word.getBoundingClientRect();
    const b = plain.getBoundingClientRect();
    plain.remove();
    return { word: [a.width, a.height], plain: [b.width, b.height] };
  }, selector);
}

test('the wordmark matches plain text: header and sign-in', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/queue');
  await expect(page.locator('header h1 .rjb-flame svg')).toBeVisible();
  await expect(page.locator('header .rjb-wordmark-l').first()).toHaveAttribute('style', /skewX/);
  const header = await compareToPlain(page, 'header h1.rjb-logo-word');
  expect(Math.abs(header.word[0] - header.plain[0])).toBeLessThanOrEqual(1);
  expect(Math.abs(header.word[1] - header.plain[1])).toBeLessThanOrEqual(1);

  await page.getByRole('button', { name: /^Account/ }).click();
  await page.getByRole('menuitem', { name: /^Sign in/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Sign in' });
  await expect(dialog.locator('.rjb-logo-word .rjb-flame svg')).toBeVisible();
  const signIn = await compareToPlain(page, '[role="dialog"] .rjb-logo-word');
  expect(Math.abs(signIn.word[0] - signIn.plain[0])).toBeLessThanOrEqual(1);
  expect(Math.abs(signIn.word[1] - signIn.plain[1])).toBeLessThanOrEqual(1);
});
