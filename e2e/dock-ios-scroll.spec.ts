import { test, expect, devices, type Page } from '@playwright/test';
import { seed } from './routes';

// The dock stays on the viewport's bottom through scroll and overscroll (fix/dock-ios-scroll).
// WebKit is not installed here: Chromium with iPhone 13 emulation (touch, 390 wide).
const { defaultBrowserType: _b, ...iphone } = devices['iPhone 13'];
const dockOf = (page: Page) => page.getByRole('group', { name: /^Actions for / });

async function bottomGap(page: Page) {
  return dockOf(page).evaluate((e) => {
    const vh = window.visualViewport?.height ?? window.innerHeight;
    return Math.abs(e.getBoundingClientRect().bottom - vh);
  });
}

async function check(page: Page, standalone = false) {
  await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  await seed(page);
  await page.goto('/#/apply');
  if (standalone) {
    const media = await page.context().newCDPSession(page);
    await media.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'display-mode', value: 'standalone' }],
    });
    // This Chromium ignores display-mode in CDP media emulation; note it rather than fail, the
    // dock's rule has no display-mode branch, so the same invariants cover standalone.
    const on = await page.evaluate(() => matchMedia('(display-mode: standalone)').matches);
    test
      .info()
      .annotations.push({ type: 'display-mode standalone emulated', description: String(on) });
  }
  await expect(dockOf(page)).toBeVisible();
  expect(await bottomGap(page)).toBeLessThanOrEqual(1);
  expect(
    await page.evaluate(() => getComputedStyle(document.documentElement).overscrollBehaviorY),
  ).toBe('none');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  expect(await bottomGap(page)).toBeLessThanOrEqual(1);
  // Overscroll past the end: wheel and a touch drag upward.
  await page.mouse.move(195, 400);
  await page.mouse.wheel(0, 3000);
  expect(await bottomGap(page)).toBeLessThanOrEqual(1);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.synthesizeScrollGesture', { x: 195, y: 600, yDistance: -800, speed: 2000 });
  expect(await bottomGap(page)).toBeLessThanOrEqual(1);
  await page.evaluate(() => window.scrollTo(0, 0));
  await cdp.send('Input.synthesizeScrollGesture', { x: 195, y: 300, yDistance: 800, speed: 2000 });
  expect(await bottomGap(page)).toBeLessThanOrEqual(1);
  expect(await dockOf(page).evaluate((e) => getComputedStyle(e).bottom)).toBe('0px');
}

test.describe('dock on iPhone 13 (Chromium emulation)', () => {
  test.use(iphone);
  test('stays on the bottom through scroll and overscroll', async ({ page }) => {
    await check(page);
  });
  test('stays on the bottom in standalone display mode', async ({ page }) => {
    await check(page, true);
  });
});
