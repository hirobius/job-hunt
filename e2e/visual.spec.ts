// Screenshot baselines (redesign-mobile guardrail, docs/guardrails.md): every route at 390 in
// light and dark, plus the Pipeline and the job page at 1440. A spacing or type change shows up
// as a pixel diff; update the baselines on purpose with
//   npm run test:visual -- --update-snapshots
// and review the new PNGs in the diff. Baselines are from the cloud session's Chromium on Linux.
// They capture the reduced-motion render only (reducedMotion: 'reduce' below): the animated logo
// held on frame 0. Its motion is covered by e2e/brand.spec.ts and src/brand/roleFlameMotion.test.tsx.
import { test, expect, type Page } from '@playwright/test';
import { ROUTES, go, openJob, openApply, seed } from './routes';

// A fixed clock and zone, so sample data's dates and "10d ago" read the same every run.
const NOW = new Date('2026-10-21T17:00:00Z');

async function prepare(page: Page, theme: 'light' | 'dark') {
  await page.clock.setFixedTime(NOW);
  await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  await page.addInitScript((t) => localStorage.setItem('rjb_color_mode', t), theme);
  // Scanned just now, so the auto-scan doesn't run on open: Today's status line holds still.
  await page.addInitScript(
    (at) =>
      localStorage.setItem(
        'rjb_autoscan',
        JSON.stringify({ finishedAt: at, newCount: 0, sourceCount: 0, found: [] }),
      ),
    NOW.getTime(),
  );
  await seed(page);
}

async function shoot(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.move(0, 0);
  await expect.soft(page).toHaveScreenshot(`${name}.png`, { fullPage: true });
}

const slug = (hash: string) => hash.replace(/^#\//, '').replace(/[^a-z0-9]+/gi, '-');

for (const theme of ['light', 'dark'] as const) {
  test.describe(`${theme} 390`, () => {
    test.use({
      viewport: { width: 390, height: 844 },
      colorScheme: theme,
      timezoneId: 'UTC',
      // The animated logo (RoleFlame.tsx) runs on a JS clock that `animations: 'disabled'` can't stop;
      // reduced motion holds it on frame 0, so the header is the same on every run.
      reducedMotion: 'reduce',
      locale: 'en-US',
    });

    test('every route matches its baseline', async ({ page }) => {
      test.setTimeout(180_000);
      await prepare(page, theme);
      for (const hash of ROUTES) {
        await go(page, hash);
        await shoot(page, `${theme}-390-${slug(hash)}`);
      }
      await openJob(page);
      await shoot(page, `${theme}-390-job-page`);
      await openApply(page);
      await shoot(page, `${theme}-390-apply-mode`);
    });
  });

  test.describe(`${theme} 1440`, () => {
    test.use({
      viewport: { width: 1440, height: 900 },
      colorScheme: theme,
      timezoneId: 'UTC',
      // The animated logo (RoleFlame.tsx) runs on a JS clock that `animations: 'disabled'` can't stop;
      // reduced motion holds it on frame 0, so the header is the same on every run.
      reducedMotion: 'reduce',
      locale: 'en-US',
    });

    test('the Pipeline and the job page match their baselines', async ({ page }) => {
      test.setTimeout(120_000);
      await prepare(page, theme);
      await go(page, '#/queue');
      await shoot(page, `${theme}-1440-queue`);
      await openJob(page);
      await shoot(page, `${theme}-1440-job-page`);
    });
  });
}
