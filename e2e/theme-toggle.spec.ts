import { test, expect, type Page } from '@playwright/test';

// #688: the app bar's HDS ThemeToggle (left of the Account avatar, 44px) is the one theme switch.
// With motion the new theme burns in from the press (a View Transition held open for the burn);
// under reduced motion it swaps at once. The theme-color metas follow the page.
const theme = (page: Page) => page.evaluate(() => document.documentElement.dataset.theme);
const burning = (page: Page) =>
  page.evaluate(() => document.documentElement.hasAttribute('data-rjb-burning'));
const metas = (page: Page) =>
  page.evaluate(() => {
    const bg = getComputedStyle(document.body).backgroundColor;
    return [...document.querySelectorAll('meta[name="theme-color"]')].map(
      (m) => m.getAttribute('content') === bg,
    );
  });

async function open(page: Page) {
  await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  await page.goto('/#/review');
  const toggle = page
    .getByRole('banner')
    .getByRole('button', { name: /^Switch to (dark|light) theme$/ });
  await expect(toggle).toBeVisible();
  return toggle;
}

test('sits left of Account, 44px, and names the next theme with no aria-pressed', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const toggle = await open(page);
  const b = (await toggle.boundingBox())!;
  expect([Math.round(b.width), Math.round(b.height)]).toEqual([44, 44]);
  const account = (await page.getByRole('button', { name: 'Account' }).boundingBox())!;
  expect(b.x + b.width).toBeLessThanOrEqual(account.x);
  expect(Math.abs(b.y + b.height / 2 - (account.y + account.height / 2))).toBeLessThanOrEqual(1);
  await expect(toggle).not.toHaveAttribute('aria-pressed');
});

test('a press burns the new theme in, then the metas follow; the keyboard too', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const toggle = await open(page);
  const before = await theme(page);
  const next = before === 'dark' ? 'light' : 'dark';
  const header = await page.getByRole('banner').boundingBox();
  await toggle.click();
  // The burn holds a View Transition open; the theme is already the new one under it.
  await expect.poll(() => burning(page)).toBe(true);
  expect(await theme(page)).toBe(next);
  await expect.poll(() => burning(page), { timeout: 5000 }).toBe(false);
  expect(await metas(page)).toEqual([true, true]);
  // No layout shift: the app bar did not move.
  expect(await page.getByRole('banner').boundingBox()).toEqual(header);
  // From the keyboard it burns too (from the button's centre) and comes back.
  await page.getByRole('button', { name: `Switch to ${before} theme` }).focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => theme(page)).toBe(before);
  await expect.poll(() => burning(page), { timeout: 5000 }).toBe(false);
  expect(await metas(page)).toEqual([true, true]);
});

test('under reduced motion the theme swaps at once, with no burn', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const toggle = await open(page);
  const before = await theme(page);
  await page.evaluate(() => {
    const w = window as unknown as { burned: boolean };
    w.burned = false;
    new MutationObserver(() => {
      if (document.documentElement.hasAttribute('data-rjb-burning')) w.burned = true;
    }).observe(document.documentElement, { attributes: true });
  });
  await toggle.click();
  expect(await theme(page)).not.toBe(before);
  expect(await metas(page)).toEqual([true, true]);
  expect(await page.evaluate(() => (window as unknown as { burned: boolean }).burned)).toBe(false);
});

// #688: opened by a tap, the Account sheet shows no focus ring anywhere; opened by the keyboard,
// the first item takes focus with its ring.
const ringed = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[role="menu"] [role^="menuitem"]')]
      .filter((e) => {
        const s = getComputedStyle(e);
        return s.outlineStyle !== 'none' && s.outlineWidth !== '0px';
      })
      .map((e) => e.textContent),
  );

test.describe('Account sheet focus', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test('a tap opens it with no visible ring, also after a row is toggled', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Account' }).tap();
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await expect.poll(() => ringed(page)).toEqual([]);
    // A tapped toggle row stays highlighted under the finger: still no ring.
    await menu.getByRole('menuitemcheckbox', { name: 'Pause animations' }).tap();
    await expect.poll(() => ringed(page)).toEqual([]);
  });

  test('the keyboard opens it on the first item, with its ring', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Account' }).focus();
    await page.keyboard.press('Enter');
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitem').first()).toBeFocused();
    await expect.poll(() => ringed(page)).toHaveLength(1);
  });
});

// Adrian's recording (#695): the app-bar logo turned at once. Its old-theme copy is clipped to the
// unburnt side, so mid-burn the logo, far from the press, still reads in the old theme.
test('the logo keeps the old theme until the front reaches it', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'no-preference', colorScheme: 'light' });
  const toggle = await open(page);
  if ((await theme(page)) === 'dark') {
    await toggle.click();
    await expect.poll(() => burning(page), { timeout: 5000 }).toBe(false);
  }
  const logo = page.getByRole('banner').locator('.rjb-logo-link');
  const b = (await logo.boundingBox())!;
  // The name only (the logo's right part): the flame is blue in both themes.
  const box = { x: b.x + b.width * 0.35, y: b.y, width: b.width * 0.65, height: b.height };
  // Share of dark pixels there: the name's ink on the light page; none if it turned light early.
  const dark = async () => {
    const png = (await page.screenshot({ clip: box })).toString('base64');
    return page.evaluate(async (src) => {
      const img = new Image();
      img.src = `data:image/png;base64,${src}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] < 240) n++;
      return n / (d.length / 4);
    }, png);
  };
  const before = await dark();
  expect(before).toBeGreaterThan(0.02);
  await page.getByRole('banner').getByRole('button', { name: 'Switch to dark theme' }).click();
  await expect.poll(() => burning(page)).toBe(true);
  // The front starts at the button, far right; the logo at the far left is not reached yet.
  const mid = await dark();
  expect(mid).toBeGreaterThan(before * 0.5);
  await expect.poll(() => burning(page), { timeout: 5000 }).toBe(false);
  expect(await dark()).toBeGreaterThan(0.5);
});

// #695: nothing fades to the new theme behind the front. A control right beside the press (the
// open top tab, whose background has a transition) already has its final colour mid-burn.
test('behind the front, controls are in the new colours at once (no transition)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const toggle = await open(page);
  const tab = page.locator('nav[aria-label="Sections"] a[aria-current="page"]');
  const bg = () =>
    tab.evaluate((e) => getComputedStyle(e).backgroundColor + getComputedStyle(e).color);
  const start = await bg();
  await toggle.click();
  await expect.poll(() => burning(page)).toBe(true);
  // Mid-burn: the switching class is on and the tab already reads its final colours.
  expect(
    await page.evaluate(() => document.documentElement.classList.contains('rjb-theme-switching')),
  ).toBe(true);
  const mid = await bg();
  await expect.poll(() => burning(page), { timeout: 5000 }).toBe(false);
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.classList.contains('rjb-theme-switching')),
    )
    .toBe(false);
  const end = await bg();
  expect(end).not.toBe(start);
  expect(mid).toBe(end);
});

// #695 (Adrian): the switch itself answers the tap at once: its icon state flips within a frame.
test('the theme switch flips its icon within one frame of the press', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await open(page);
  const flipped = await page.evaluate(
    () =>
      new Promise<[string | null, string | null]>((done) => {
        const b = document.querySelector<HTMLButtonElement>('header .rjb-theme-toggle')!;
        const before = b.getAttribute('aria-label');
        b.click();
        requestAnimationFrame(() => done([before, b.getAttribute('aria-label')]));
      }),
  );
  expect(flipped[0]).not.toBe(flipped[1]);
  await expect.poll(() => burning(page), { timeout: 5000 }).toBe(false);
});

// #695 follow-up (Adrian's iPhone recording): the burn's edge layer must sit on the reveal. Mid-burn,
// at a scrolled position and at DPR 2 and 3, the edge layer covers exactly the viewport the clip is
// drawn in (innerWidth × innerHeight from 0,0), and its path ends with the very hole the clip uses.
for (const dpr of [2, 3])
  test(`the burn edge shares the reveal's geometry (DPR ${dpr}, scrolled)`, async ({ browser }) => {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 664 },
      deviceScaleFactor: dpr,
      reducedMotion: 'no-preference',
    });
    const page = await ctx.newPage();
    const toggle = await open(page);
    await page.evaluate(() => window.scrollTo(0, 400));
    await toggle.click();
    await expect.poll(() => burning(page)).toBe(true);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const svg = document.querySelector<SVGSVGElement>('svg.rjb-burn-rim[data-root]');
          const d = svg?.querySelector('path')?.getAttribute('d') ?? '';
          return d.length > 0;
        }),
      )
      .toBe(true);
    const geo = await page.evaluate(() => {
      const svg = document.querySelector<SVGSVGElement>('svg.rjb-burn-rim[data-root]')!;
      const r = svg.getBoundingClientRect();
      const clip = document.documentElement.style.getPropertyValue('--rjb-burn-clip');
      const hole = /path\(evenodd, '(.*)'\)/.exec(clip)?.[1] ?? '';
      const d = svg.querySelector('path')!.getAttribute('d')!;
      return {
        box: [r.left, r.top, r.width, r.height],
        view: [0, 0, innerWidth, innerHeight],
        viewBox: svg.getAttribute('viewBox'),
        sameHole: hole === '' || d.endsWith(hole),
      };
    });
    expect(geo.box).toEqual(geo.view);
    expect(geo.viewBox).toBe(`0 0 ${geo.view[2]} ${geo.view[3]}`);
    expect(geo.sameHole).toBe(true);
    await expect.poll(() => burning(page), { timeout: 5000 }).toBe(false);
    await ctx.close();
  });
