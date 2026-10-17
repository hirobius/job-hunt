// Design polish probe (#133): axe on every route, light and dark, 1440 and 390; at 390 a touch-target
// probe; and a computed-style sweep (no uppercase, no running transition under reduced motion).
// Local only (no Actions): `npm run test:e2e`. axe-core comes with vitest-axe, so no new dependency.
import { test, expect, type Page } from '@playwright/test';
import { createRequire } from 'node:module';

const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

const THEMES = ['light', 'dark'] as const;
const WIDTHS = [1440, 390] as const;
// Hash routes reached once a track and the sample pipeline exist. The job page is added below.
const ROUTES = [
  '#/today',
  '#/queue',
  '#/discover',
  '#/discover/titles',
  '#/discover/ats',
  '#/discover/live',
  '#/discover/boards',
  '#/discover/teams',
  '#/copy-deck',
  '#/copy-deck/tpl-outreach',
];

async function seed(page: Page) {
  await page.goto('/#/queue');
  await page.getByRole('button', { name: 'Try with sample data' }).click();
  await page.getByRole('tab', { name: 'Discover' }).click();
  await page.getByRole('button', { name: 'Choose a track' }).click();
  await page.getByRole('group', { name: 'Starter tracks' }).getByRole('checkbox').first().click();
  for (const name of ['Continue', 'Continue', 'Finish'])
    await page.getByRole('button', { name, exact: true }).click();
  await expect(page.getByRole('tablist', { name: 'Your sections' })).toBeVisible();
}

async function go(page: Page, hash: string) {
  await page.evaluate((h) => (location.hash = h), hash);
  await page.waitForTimeout(500);
}

async function axeViolations(page: Page) {
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await (window as any).axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return r.violations.map((v: any) => `${v.id} x${v.nodes.length}: ${v.nodes[0]?.target}`);
  });
}

for (const theme of THEMES) {
  for (const width of WIDTHS) {
    test.describe(`${theme} ${width}`, () => {
      test.use({ viewport: { width, height: width > 600 ? 900 : 844 }, colorScheme: theme });

      test('every route has no axe violations', async ({ page }) => {
        test.setTimeout(120_000);
        // Discovery tools call public APIs; the probe is about the page, so refuse them.
        await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
        await page.addInitScript((t) => localStorage.setItem('rjb_color_mode', t), theme);
        await seed(page);
        const bad: string[] = [];
        for (const hash of ROUTES) {
          await go(page, hash);
          for (const v of await axeViolations(page)) bad.push(`${hash} ${v}`);
        }
        await go(page, '#/queue');
        const job = page.locator('a[href^="#/queue/"]').first();
        await job.click();
        await page.waitForTimeout(500);
        for (const v of await axeViolations(page)) bad.push(`job page ${v}`);
        expect(bad).toEqual([]);
      });
    });
  }
}

test.describe('phone sweep', () => {
  test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });

  test('touch targets, casing and motion', async ({ page }) => {
    test.setTimeout(120_000);
    await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
    await seed(page);
    const small: string[] = [];
    const upper: string[] = [];
    const moving: string[] = [];
    for (const hash of ROUTES) {
      await go(page, hash);
      const found = await page.evaluate(() => {
        const out = { small: [] as string[], upper: [] as string[], moving: [] as string[] };
        const label = (el: Element) =>
          `${el.tagName.toLowerCase()}[${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)}]`;
        document
          .querySelectorAll('button, [role="tab"], [role="menuitem"], [role="radio"], select')
          .forEach((el) => {
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) return;
            // Height always; width only for icon-only controls (a labelled one is as wide as its label).
            const iconOnly = !(el.textContent || '').trim();
            // HDS's own clear-input button is 30px wide (hds#750).
            if (el.getAttribute('aria-label') === 'Clear input') return;
            if (r.height < 40 || (iconOnly && r.width < 40))
              out.small.push(`${label(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
          });
        document.querySelectorAll('body *').forEach((el) => {
          const cs = getComputedStyle(el);
          if (cs.textTransform === 'uppercase') out.upper.push(label(el));
          const running = el.getAnimations().some((a) => a.playState === 'running');
          if (running && !/spinner|skeleton|progress/i.test(el.className?.toString() ?? ''))
            out.moving.push(label(el));
        });
        return out;
      });
      small.push(...found.small.map((s) => `${hash} ${s}`));
      upper.push(...found.upper.map((s) => `${hash} ${s}`));
      moving.push(...found.moving.map((s) => `${hash} ${s}`));
    }
    expect([...new Set(small)]).toEqual([]);
    expect(upper).toEqual([]);
    expect(moving).toEqual([]);
  });
});
