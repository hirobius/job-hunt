import { test, expect } from '@playwright/test';
import { seed, listScope, topTab } from './routes';

// Three controls Adrian approved (2026-11-09), at 390 and 1440: Find / Apply drawn as an HDS
// segmented control but still a nav of links (routing, Back, deep links); Find with no view switch
// or filter row (list only, 2026-11-13); Apply's Remote only switch, per device, that narrows the
// pager's "n of N" and the All jobs sheet. Since #548 Find / Apply sit in the app bar's one row at
// every width, each with its count.
for (const width of [390, 1440]) {
  test.describe(`at ${width}`, () => {
    test.use({ viewport: { width, height: width < 600 ? 844 : 900 } });

    test('Find / Apply: a segmented nav that routes, with Back and deep links', async ({
      page,
    }) => {
      await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
      await page.goto('/#/apply');
      const nav = page.getByRole('navigation', { name: 'Sections' });
      await expect(topTab(page, 'Apply')).toHaveAttribute('aria-current', 'page');
      await expect(page.getByRole('radiogroup')).toHaveCount(0);
      // The bar can re-render as the lazy logo lands; measure until both boxes are there.
      await expect(async () => {
        const box = await nav.boundingBox();
        const logo = await page
          .getByRole('img', { name: 'roleflame' })
          .locator('visible=true')
          .first()
          .boundingBox();
        expect(box && logo).toBeTruthy();
        // The page bar (2026-11-12): at top left of the page, where its title was, under the
        // app bar's one row (the logo, then Account on its row at the right).
        expect(box!.y).toBeGreaterThan(logo!.y + logo!.height - 1);
        expect(Math.abs(box!.x - logo!.x)).toBeLessThan(12);
        const main = await page.getByRole('main').boundingBox();
        expect(box!.y - main!.y).toBeLessThan(2);
        const account = await page.getByRole('button', { name: /^Account/ }).boundingBox();
        expect(
          Math.abs(account!.y + account!.height / 2 - (logo!.y + logo!.height / 2)),
        ).toBeLessThan(24);
        expect(account!.x).toBeGreaterThan(logo!.x + logo!.width - 1);
        expect(account!.width).toBeGreaterThanOrEqual(44);
      }).toPass({ timeout: 10_000 });
      await topTab(page, 'Find').click();
      await expect(page).toHaveURL(/#\/find/);
      await expect(topTab(page, 'Find')).toHaveAttribute('aria-current', 'page');
      await page.goBack();
      await expect(page).toHaveURL(/#\/apply/);
      await expect(topTab(page, 'Apply')).toHaveAttribute('aria-current', 'page');
    });

    test('the top tabs show no counts (2026-11-13)', async ({ page }) => {
      await seed(page);
      await page.goto('/#/apply');
      const nav = page.getByRole('navigation', { name: 'Sections' });
      await expect(nav.getByRole('link', { name: /^Apply/ })).toHaveAccessibleName('Apply');
      await expect(nav.getByRole('link', { name: /^Find/ })).toHaveAccessibleName('Find');
    });

    test('Find: one list, no view switch and no filter row (2026-11-13)', async ({ page }) => {
      await seed(page);
      await page.goto('/#/find');
      await expect(page.getByRole('list', { name: 'New postings' })).toBeVisible();
      await expect(page.getByRole('button', { name: /^View: / })).toHaveCount(0);
      await expect(page.getByRole('checkbox')).toHaveCount(0);
      await expect(page.getByRole('group', { name: 'Filter postings' })).toHaveCount(0);
      // Phones keep only the pager row; at lg there is none.
      await expect(page.getByRole('group', { name: 'Postings in the list' })).toHaveCount(
        width < 1024 ? 1 : 0,
      );
    });

    test('Remote only: narrows the list, kept on reload (a chip in the sheet, the switch at lg)', async ({
      page,
    }) => {
      await seed(page);
      await page.goto('/#/apply');
      const phone = width < 1024;
      // On a phone the filter is a chip in the All jobs sheet (#543), never on the job page; at
      // lg the list column's one visible control (#614).
      if (phone) await expect(page.getByRole('switch', { name: 'Remote only' })).toHaveCount(0);
      const list = await listScope(page);
      const sw = phone
        ? list.getByRole('button', { name: 'Remote only' })
        : list.getByRole('switch', { name: 'Remote only' });
      const isOn = async () =>
        phone ? (await sw.getAttribute('aria-pressed')) === 'true' : sw.isChecked();
      await expect(sw).toBeVisible();
      const count = () =>
        list.getByRole('navigation', { name: 'Jobs' }).getByRole('listitem').count();
      const all = await count();
      await sw.click();
      await expect.poll(isOn).toBe(true);
      await expect.poll(count).toBeLessThan(all);
      const remote = await count();
      expect(remote).toBeGreaterThan(0);
      if (phone) {
        await page.keyboard.press('Escape');
        await expect(list).toHaveCount(0);
        await expect(
          page.getByRole('navigation', { name: 'Jobs in the list' }).getByText(`of ${remote}`),
        ).toBeVisible();
      }
      await page.reload();
      const again = await listScope(page);
      const sw2 = phone
        ? again.getByRole('button', { name: 'Remote only' })
        : again.getByRole('switch', { name: 'Remote only' });
      if (phone) await expect(sw2).toHaveAttribute('aria-pressed', 'true');
      else await expect(sw2).toBeChecked();
      await expect
        .poll(() => again.getByRole('navigation', { name: 'Jobs' }).getByRole('listitem').count())
        .toBe(remote);
    });

    test('Remote only on each view: chip count, status line and list agree (#614)', async ({
      page,
    }) => {
      await seed(page);
      await page.goto('/#/apply');
      const phone = width < 1024;
      const list = await listScope(page);
      const sw = phone
        ? list.getByRole('button', { name: 'Remote only' })
        : list.getByRole('switch', { name: 'Remote only' });
      const isOn = async () =>
        phone ? (await sw.getAttribute('aria-pressed')) === 'true' : sw.isChecked();
      const chips = list.getByRole('group', { name: 'Views' }).first().getByRole('button');
      const names = (await chips.allTextContents()).map((t) => t.replace(/\s*\d+$/, '').trim());
      // The lg column's status line ("To apply · N jobs"); the sheet says "N jobs shown" (#543).
      const status = list
        .getByRole('status')
        .filter({ hasText: phone ? /^\d+ jobs? shown$/ : /· \d+ jobs?/ })
        .first();
      const shownCount = async () => Number((await status.textContent())!.match(/(\d+) jobs?/)![1]);
      for (const on of [false, true]) {
        if ((await isOn()) !== on) await sw.click();
        for (const name of names) {
          const chip = chips.filter({ hasText: name }).first();
          await chip.click();
          await expect(chip).toHaveAttribute('aria-pressed', 'true');
          const badge = Number((await chip.textContent())!.match(/(\d+)\s*$/)![1]);
          await expect.poll(shownCount, `${name}, Remote only ${on}`).toBe(badge);
          const n = await list
            .getByRole('navigation', { name: 'Jobs' })
            .locator('a[href^="#/apply/"]')
            .count();
          expect(n, `${name} rows`).toBe(badge);
        }
      }
    });
  });
}

// Equal segments, no counts (2026-11-13): Find | Apply are two
// equal segments, each 44px tall on a phone; the page bar fits on one row at 375 and 390 and wraps,
// never scrolls sideways, at 320.
for (const width of [320, 375, 390]) {
  test(`Find | Apply: equal segments, no counts, fit at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
    await seed(page);
    await page.goto('/#/apply');
    const nav = page.getByRole('navigation', { name: 'Sections' });
    const apply = nav.getByRole('link', { name: /^Apply/ });
    await expect(apply).toHaveAccessibleName('Apply');
    await expect(nav.locator('.rjb-seg-count')).toHaveCount(0);
    const [find, app] = [await topTab(page, 'Find').boundingBox(), await apply.boundingBox()];
    expect(Math.abs(find!.width - app!.width)).toBeLessThan(1);
    expect(Math.abs(find!.y - app!.y)).toBeLessThan(1);
    expect(find!.height).toBeGreaterThanOrEqual(44);
    const navBox = await nav.boundingBox();
    expect(navBox!.x + navBox!.width).toBeLessThanOrEqual(width);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });
}

// The walk control's view picker (2026-11-13): a select-style key with the Find chips' fill and
// 40px height, the caret inside it, its left edge on the page gutter under Find | Apply and the
// job title; its hit area stays 44px, and its name stays "View: <name>".
test.describe('at 390, the view picker', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('reads as a control on the gutter', async ({ page }) => {
    await seed(page);
    await page.goto('/#/apply');
    const picker = page.getByRole('button', { name: /^View: / });
    await expect(picker).toHaveAccessibleName('View: To apply');
    const nav = await page.getByRole('navigation', { name: 'Sections' }).boundingBox();
    const title = await page.getByRole('main').getByRole('heading', { level: 1 }).boundingBox();
    const box = await picker.boundingBox();
    expect(Math.abs(box!.x - nav!.x)).toBeLessThan(1);
    expect(Math.abs(box!.x - title!.x)).toBeLessThan(1);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    const fill = await picker.evaluate((el) => {
      const a = getComputedStyle(el, '::after');
      return { bg: a.backgroundColor, h: parseFloat(a.height), w: parseFloat(a.width) };
    });
    expect(fill.bg).not.toBe('rgba(0, 0, 0, 0)');
    expect(fill.h).toBeCloseTo(40, 0);
    expect(fill.w).toBeCloseTo(box!.width, 0);
    // The chip's fill: the same colour and height as Find's New chip.
    await page.goto('/#/find');
    const chip = page.getByRole('group', { name: 'Filter postings' }).getByRole('button').first();
    const chipFill = await chip.evaluate((el) => {
      const s = getComputedStyle(el.firstElementChild as Element);
      return {
        bg: s.backgroundColor,
        h: (el.firstElementChild as Element).getBoundingClientRect().height,
      };
    });
    expect(chipFill.bg).toBe(fill.bg);
    expect(chipFill.h).toBeCloseTo(fill.h, 0);
    await page.goto('/#/apply');
    // The caret sits inside the fill.
    const caret = await picker.locator('svg').boundingBox();
    expect(caret!.x + caret!.width).toBeLessThan(box!.x + box!.width);
  });
});
