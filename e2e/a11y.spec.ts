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
  '#/copy-deck',
  '#/copy-deck/tpl-outreach',
  '#/legal/privacy',
  '#/legal/terms',
  // A Company's page (#230), named by a sample job's company.
  '#/company/larkspur-analytics',
  // An unknown route's Page not found.
  '#/nope',
];

async function seed(page: Page) {
  await page.goto('/#/queue');
  await page.getByRole('button', { name: 'Try with sample data' }).click();
  // A clean first run has no messages (Adrian 2026-10-22): add the starters, as a user would.
  await go(page, '#/copy-deck');
  await page.getByRole('button', { name: 'Add starter messages' }).click();
  await expect(page.getByRole('region', { name: 'Outreach messages' })).toBeVisible();
  // The sample adds a Sample track from the first starter pack: no setup needed.
  await go(page, '#/today');
  await expect(page.getByRole('region', { name: /^Review new/ })).toBeVisible();
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
        // Apply mode (#/apply/<jobId>, #219): its id comes from the sample data, so start it.
        await go(page, '#/queue');
        await page.getByRole('button', { name: 'Start applying' }).click();
        await expect(page).toHaveURL(/#\/apply\//);
        await page.waitForTimeout(500);
        for (const v of await axeViolations(page)) bad.push(`apply mode ${v}`);
        expect(bad).toEqual([]);
      });
    });
  }
}

test.describe('landmarks', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('every route has one main and no content outside a landmark', async ({ page }) => {
    test.setTimeout(120_000);
    await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
    await seed(page);
    const bad: string[] = [];
    for (const hash of ROUTES) {
      await go(page, hash);
      await page.addScriptTag({ path: AXE });
      const v = await page.evaluate(async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r = await (window as any).axe.run(document, {
          runOnly: { type: 'rule', values: ['landmark-one-main', 'region'] },
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return r.violations.map((x: any) => `${x.id} x${x.nodes.length}: ${x.nodes[0]?.target}`);
      });
      bad.push(...v.map((x: string) => `${hash} ${x}`));
    }
    expect(bad).toEqual([]);
  });
});

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

// A keyboard walk of every route (2026-10-27 audit), past what axe reads from a still page: one
// h1, inside main (the page's own name, #363), and no skipped heading level; every Tab stop has a name, shows that it has focus (its own or
// its field's ring, border or fill changes), is on screen once focused, and Tab never sticks.
async function headingSkips(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const hs = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')].filter(
      (h) => h.getClientRects().length > 0,
    );
    const out: string[] = [];
    const h1s = hs.filter((h) => h.tagName === 'H1');
    if (h1s.length !== 1) out.push(`${h1s.length} h1`);
    // The h1 names the page (#363): inside main, never the banner's wordmark.
    else if (!h1s[0].closest('main')) out.push(`h1 outside main "${h1s[0].textContent?.trim()}"`);
    let prev = 0;
    for (const h of hs) {
      const l = +h.tagName[1];
      if (prev && l > prev + 1)
        out.push(`h${prev} → h${l} "${h.textContent?.trim().slice(0, 30)}"`);
      prev = l;
    }
    return out;
  });
}

async function tabWalk(page: Page): Promise<string[]> {
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    (document.activeElement as HTMLElement | null)?.blur?.();
  });
  const bad: string[] = [];
  const seen = new Set<string>();
  let last: { key: string; look: string } | null = null;
  for (let i = 0; i < 80; i++) {
    await page.keyboard.press('Tab');
    const s = await page.evaluate(async (prevKey) => {
      // Let focus transitions end first, or a ring mid-fade reads as a change that isn't there.
      await Promise.all(
        document
          .getAnimations()
          .filter(
            (a) => a.playState === 'running' && a.effect?.getComputedTiming().endTime !== Infinity,
          )
          .map((a) => a.finished.catch(() => {})),
      );
      const el = document.activeElement as HTMLElement | null;
      // Its look: the element's and its two nearest boxes' ring, border and fill.
      const look = (e: Element | null) => {
        const o: string[] = [];
        for (let n = e, i = 0; n && i < 3; n = n.parentElement, i++) {
          const cs = getComputedStyle(n);
          // An outline's colour only shows when it has a style (HDS sets the colour on focus).
          const ring =
            cs.outlineStyle === 'none' ? 'none' : `${cs.outlineStyle} ${cs.outlineColor}`;
          o.push(`${ring} ${cs.boxShadow} ${cs.borderColor} ${cs.backgroundColor}`);
        }
        return o.join('|');
      };
      const prev = prevKey ? document.querySelector(`[data-walk="${prevKey}"]`) : null;
      const prevLook = prev ? look(prev) : null;
      if (!el || el === document.body) return { done: true, prevLook };
      el.dataset.walk ??= Math.random().toString(36).slice(2);
      const labelled = el
        .getAttribute('aria-labelledby')
        ?.split(' ')
        .map((id) => document.getElementById(id)?.textContent ?? '')
        .join(' ');
      const name = (
        el.getAttribute('aria-label') ||
        labelled ||
        [...((el as HTMLInputElement).labels ?? [])].map((l) => l.textContent).join(' ') ||
        el.textContent ||
        el.getAttribute('title') ||
        (el as HTMLInputElement).placeholder ||
        ''
      ).trim();
      const r = el.getBoundingClientRect();
      const onScreen = r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
      return {
        done: false,
        key: el.dataset.walk,
        what: `${el.tagName.toLowerCase()}[${name.slice(0, 30)}]`,
        name,
        onScreen: onScreen && r.width > 0 && r.height > 0,
        look: look(el),
        prevLook,
      };
    }, last?.key ?? null);
    // The previous stop, now unfocused, must look different from when it had focus.
    if (last && s.prevLook !== null && s.prevLook === last.look)
      bad.push(`no focus ring: ${last.key}`);
    if (s.done) break;
    if (seen.has(s.key!)) {
      // Back at a stop already visited: the walk wrapped round (fine) unless it is the same one.
      if (s.key === last?.key) bad.push(`Tab sticks on ${s.what}`);
      break;
    }
    seen.add(s.key!);
    if (!s.name) bad.push(`no name: ${s.what}`);
    if (!s.onScreen) bad.push(`off screen when focused: ${s.what}`);
    last = { key: s.key!, look: s.look! };
  }
  // Name the ring failures by what they are, not their key.
  return Promise.all(
    bad.map(async (b) => {
      const m = b.match(/^no focus ring: (.+)$/);
      if (!m) return b;
      const what = await page.evaluate((k) => {
        const el = document.querySelector(`[data-walk="${k}"]`);
        return `${el?.tagName.toLowerCase()}[${(el?.getAttribute('aria-label') || el?.textContent || '').trim().slice(0, 30)}]`;
      }, m[1]);
      return `no focus ring: ${what}`;
    }),
  );
}

for (const width of WIDTHS) {
  test.describe(`keyboard walk ${width}`, () => {
    test.use({ viewport: { width, height: width > 600 ? 900 : 844 } });

    test('headings in order; every Tab stop named, ringed and on screen', async ({ page }) => {
      test.setTimeout(180_000);
      await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
      await seed(page);
      const bad: string[] = [];
      const check = async (where: string) => {
        for (const v of await headingSkips(page)) bad.push(`${where} ${v}`);
        for (const v of await tabWalk(page)) bad.push(`${where} ${v}`);
      };
      for (const hash of ROUTES) {
        await go(page, hash);
        await check(hash);
      }
      await go(page, '#/queue');
      await page.locator('a[href^="#/queue/"]').first().click();
      await page.waitForTimeout(500);
      await check('job page');
      await go(page, '#/queue');
      await page.getByRole('button', { name: 'Start applying' }).click();
      await expect(page).toHaveURL(/#\/apply\//);
      await page.waitForTimeout(500);
      await check('apply mode');
      expect([...new Set(bad)]).toEqual([]);
    });
  });
}
