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
  expectStill(
    await sample(
      page,
      { flame: '.rjb-rf svg', logo: '.rjb-rf', bar: '.rjb-logo', header: 'header' },
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
