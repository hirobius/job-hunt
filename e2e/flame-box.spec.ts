import { test, expect, type Page } from '@playwright/test';

// The live flame never moves the page (Adrian 2026-11-16, an iPhone recording: the content around
// the flame seemed to move with it). Each frame rewrites the flame's paths only; its box, and every
// box around it, stay the same on every frame. This samples 60 animation frames (the engine draws
// 10 a second, so about 6 of its frames) and checks that each box has one position and one size.

type Boxes = Record<string, string[]>;

/** Each selector's distinct boxes (top, left, width, height) over `frames` animation frames,
 *  and how many distinct flame frames were drawn in that time. */
const sample = (page: Page, sel: Record<string, string>, flame: string, frames = 60) =>
  page.evaluate(
    async ({ sel, flame, frames }) => {
      const seen: Record<string, Set<string>> = {};
      const drawn = new Set<string>();
      for (let i = 0; i < frames; i++) {
        await new Promise((r) => requestAnimationFrame(r));
        drawn.add(document.querySelector(`${flame} path`)?.getAttribute('d') ?? '');
        for (const [k, s] of Object.entries(sel)) {
          const b = document.querySelector(s)?.getBoundingClientRect();
          const key = b ? [b.top, b.left, b.width, b.height].map((n) => n.toFixed(2)).join() : '-';
          (seen[k] ??= new Set()).add(key);
        }
      }
      const boxes: Record<string, string[]> = {};
      for (const [k, v] of Object.entries(seen)) boxes[k] = [...v];
      return { boxes, drawn: drawn.size };
    },
    { sel, flame, frames },
  );

const expectStill = ({ boxes, drawn }: { boxes: Boxes; drawn: number }) => {
  // The flame burned while we watched (else the check proves nothing).
  expect(drawn).toBeGreaterThan(2);
  for (const [k, v] of Object.entries(boxes)) {
    expect(v, k).toHaveLength(1);
    expect(v[0], k).not.toBe('-');
  }
};

test.use({ viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ context }) => {
  await context.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
});

test('app bar: the logo and the page keep their boxes on every frame', async ({ page }) => {
  await page.goto('/#/review');
  await page.locator('.rjb-rf svg').waitFor();
  // The recording: Review, scrolled a little, the page under the bar moving with the flame. The
  // segmented control (Review / Apply) is the first thing under the bar.
  await page.mouse.wheel(0, 24);
  await page.waitForTimeout(300);
  expectStill(
    await sample(
      page,
      {
        flame: '.rjb-rf svg',
        logo: '.rjb-rf',
        bar: '.rjb-logo',
        header: 'header',
        tabs: '.rjb-page-bar',
      },
      '.rjb-rf svg',
    ),
  );
});

test('sign-in: the stacked brand and the step keep their boxes on every frame', async ({
  page,
}) => {
  await page.goto('/#/apply');
  await page.getByRole('button', { name: /^Account/ }).click();
  await page.getByRole('menuitem', { name: /^Sign in/ }).click();
  await page.locator('.rjb-signin-screen .rjb-rf svg').waitFor();
  // Past the screen's own entry transition.
  await page.waitForTimeout(500);
  expectStill(
    await sample(
      page,
      {
        flame: '.rjb-signin-screen .rjb-rf svg',
        brand: '.rjb-signin-screen__brand',
        step: '.rjb-signin-screen__step',
      },
      '.rjb-signin-screen .rjb-rf svg',
    ),
  );
});

test('boot splash: the flame keeps its box on every frame', async ({ page }) => {
  // Hold the splash: the app's entry never loads, so React never replaces it (the splash's own
  // flame script, bootFlame.ts, still runs).
  await page.route(/\/src\/main\.tsx/, (r) => r.abort());
  await page.goto('/#/review');
  await page.locator('.rjb-boot .rjb-flame svg').waitFor();
  expectStill(
    await sample(
      page,
      { flame: '.rjb-boot .rjb-flame svg', splash: '.rjb-boot .rjb-flame' },
      '.rjb-boot .rjb-flame svg',
    ),
  );
});

// The cause of the recording (2026-11-16): WebKit's scroll anchoring chose the live flame, whose
// ink box changes on every frame, and moved the page's scroll position to follow it (3-5px, both
// ways). Measured in Playwright WebKit (iPhone 13): scrollY 40 drifted 33..43 while the flame
// burned; with `overflow-anchor: none` on the flame it held at 40. Chromium does not pick the
// flame, so here the rule itself is checked, and the scroll position over the frames.
test('scrolled: the flame is never the scroll anchor, so the page holds still', async ({
  page,
}) => {
  await page.goto('/#/review');
  await page.locator('.rjb-rf svg').waitFor();
  // The app bar's live logo (the still wordmark and the splash's .rjb-flame take the same rule).
  expect(
    await page.locator('header .rjb-rf').evaluate((el) => getComputedStyle(el).overflowAnchor),
  ).toBe('none');
  // Room to scroll, as a full list has.
  await page.evaluate(() => {
    document.body.style.minHeight = '3000px';
    window.scrollTo(0, 40);
  });
  const ys = await page.evaluate(async () => {
    const seen = new Set<number>();
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      seen.add(window.scrollY);
    }
    return [...seen];
  });
  expect(ys).toEqual([40]);
});
