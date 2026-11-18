// Overlays enter with motion (motion pass 2026-11-18): an HDS Dialog and Menu showed whole on
// their first frame. Each now runs one enter animation on opacity and transform only (never a
// layout property), at an HDS motion token length, and the overlay is on screen within the 300 ms
// answer. Reduced motion and Pause animations run none. Timed on the production build.
// Local only: `npm run test:e2e`.
import { test, expect, type Page } from './fixtures';
import { PROD_URL } from './routes';

type Seen = { name: string; props: string[]; ms: number; firstFrame: number };

/** Press `open`, and report the keyframe animation the newest overlay ran and when it first drew. */
async function enter(
  page: Page,
  role: 'menu' | 'dialog',
  open: () => Promise<void>,
): Promise<Seen | null> {
  await page.evaluate((role) => {
    const w = window as unknown as { __seen: Seen | null; __t0: number };
    w.__seen = null;
    w.__t0 = performance.now();
    const tick = () => {
      const el = document.querySelector(`[role=${role}]`);
      if (el && !w.__seen) {
        const a = el.getAnimations().find((x) => x instanceof CSSAnimation) as
          CSSAnimation | undefined;
        w.__seen = {
          name: a?.animationName ?? 'none',
          props: a
            ? [
                ...new Set(
                  (a.effect as KeyframeEffect).getKeyframes().flatMap((k) => Object.keys(k)),
                ),
              ].filter((k) => !['offset', 'easing', 'composite', 'computedOffset'].includes(k))
            : [],
          ms: Number(a?.effect?.getComputedTiming().duration ?? 0),
          firstFrame: performance.now() - w.__t0,
        };
        return;
      }
      if (performance.now() - w.__t0 < 2000) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, role);
  await open();
  await page.waitForTimeout(400);
  return page.evaluate(() => (window as unknown as { __seen: Seen | null }).__seen);
}

async function boot(page: Page) {
  await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  await page.goto(`${PROD_URL}/#/apply`);
  await page.getByRole('button', { name: 'Try with sample data' }).click();
  await expect(page.getByRole('button', { name: 'Try with sample data' })).toHaveCount(0);
  await page.waitForTimeout(500);
}
const item = (page: Page) => page.getByRole('menuitem', { name: /^Data/ });

for (const width of [390, 1440] as const)
  test.describe(`overlay enter ${width}`, () => {
    test.use({ viewport: { width, height: width > 600 ? 900 : 844 } });

    test('a menu and a dialog enter on opacity and transform, inside the 300 ms answer', async ({
      page,
    }) => {
      await boot(page);
      const menu = await enter(page, 'menu', () =>
        page.getByRole('button', { name: /^Account/ }).click(),
      );
      // Below sm the Account menu is a bottom sheet: it slides.
      expect(menu?.name).toBe(width < 640 ? 'rjb-sheet-in' : 'rjb-overlay-in');
      await page.waitForTimeout(300);
      // The item is pressed by script: Playwright's own click waits for the menu to stop moving.
      const dialog = await enter(page, 'dialog', () =>
        item(page).evaluate((el: HTMLElement) => el.click()),
      );
      // A dialog that is a bottom sheet below sm slides; every other one rises.
      expect(['rjb-overlay-in', 'rjb-dialog-sheet-in']).toContain(dialog?.name);
      for (const seen of [menu!, dialog!]) {
        // Never a layout property.
        expect(seen.props.every((p) => p === 'opacity' || p === 'transform')).toBe(true);
        // The productive token (150 ms), and on screen well inside the answer.
        expect(seen.ms).toBe(150);
        expect(seen.firstFrame).toBeLessThan(300);
      }
      // The dialog ends where HDS puts it: no transform left on it.
      await page.waitForTimeout(300);
      expect(await page.getByRole('dialog').evaluate((el) => getComputedStyle(el).transform)).toBe(
        'none',
      );
    });
  });

for (const width of [390, 1440] as const) {
  const viewport = { width, height: width > 600 ? 900 : 844 };

  test.describe(`overlay enter ${width}, reduced motion`, () => {
    test.use({ viewport, reducedMotion: 'reduce' });
    test('runs no enter animation', async ({ page }) => {
      await boot(page);
      const menu = await enter(page, 'menu', () =>
        page.getByRole('button', { name: /^Account/ }).click(),
      );
      expect(menu?.name).toBe('none');
      const dialog = await enter(page, 'dialog', () => item(page).click());
      expect(dialog?.name).toBe('none');
    });
  });

  test.describe(`overlay enter ${width}, Pause animations`, () => {
    test.use({ viewport });
    test('runs no enter animation', async ({ page }) => {
      await page.addInitScript(() => localStorage.setItem('rjb_ui_pause_motion', '1'));
      await boot(page);
      await expect(page.locator('html')).toHaveAttribute('data-rjb-motion', 'paused');
      const menu = await enter(page, 'menu', () =>
        page.getByRole('button', { name: /^Account/ }).click(),
      );
      expect(menu?.name).toBe('none');
      const dialog = await enter(page, 'dialog', () => item(page).click());
      expect(dialog?.name).toBe('none');
    });
  });
}
