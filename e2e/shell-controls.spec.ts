import { hitArea } from './hitArea';
import { test, expect, type Page } from '@playwright/test';
import { seed, listScope, topTab } from './routes';

// Three controls Adrian approved (2026-11-09), at 390 and 1440: Find / Apply drawn as an HDS
// segmented control but still a nav of links (routing, Back, deep links); List / Deck as one
// toggle with a tooltip (#694); Apply's Remote only switch, per device, that narrows the
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
      await topTab(page, 'Review').click();
      await expect(page).toHaveURL(/#\/review/);
      await expect(topTab(page, 'Review')).toHaveAttribute('aria-current', 'page');
      await page.goBack();
      await expect(page).toHaveURL(/#\/apply/);
      await expect(topTab(page, 'Apply')).toHaveAttribute('aria-current', 'page');
    });

    test('Review shows its count, Apply none (2026-11-13)', async ({ page }) => {
      await manyPostings(page, 12);
      await seed(page);
      await page.goto('/#/review');
      const nav = page.getByRole('navigation', { name: 'Sections' });
      await expect(nav.getByRole('link', { name: /^Review/ })).toHaveAccessibleName('Review 12');
      await expect(nav.getByRole('link', { name: /^Apply/ })).toHaveAccessibleName('Apply');
      await expect(nav.locator('.rjb-seg-count')).toHaveCount(1);
    });

    test('List / Deck: one toggle over the whole track, with a tooltip', async ({ page }) => {
      await seed(page);
      await page.goto('/#/review');
      const toggle = page.getByRole('button', { name: /^View: / });
      await expect(toggle).toHaveAccessibleName('View: List, switch to Deck');
      await expect(toggle).toHaveText('');
      await expect(toggle.locator('.rjb-seg-icon')).toHaveCount(2);
      // The whole track is its 44px target, all of it this one key.
      const hit = await hitArea(toggle);
      expect(hit.height).toBeGreaterThanOrEqual(44);
      expect(hit.misses).toEqual([]);
      // The seed's "Added to Apply" toast can land under the pointer and close the tooltip at
      // 1440: hover again until it shows.
      await expect(async () => {
        await page.mouse.move(0, 0);
        await toggle.hover();
        await expect(page.getByRole('tooltip')).toHaveText('Switch to Deck', { timeout: 1500 });
      }).toPass({ timeout: 10_000 });
      // A tap on the open (List) icon still flips: the whole track is the button.
      const box = (await toggle.boundingBox())!;
      await page.mouse.click(box.x + 6, box.y + box.height / 2);
      await expect(toggle).toHaveAccessibleName('View: Deck, switch to List');
      await toggle.focus();
      await page.keyboard.press('Space');
      await expect(toggle).toHaveAccessibleName('View: List, switch to Deck');
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

// Equal segments, Review's count (2026-11-13): Review | Apply are two equal segments, each 44px
// tall on a phone, on one row. Below 400px the count pill is hidden visually (it stays in the name),
// so the page bar never runs past the screen or overlaps its tools; from 400 the "99+" pill shows
// inside its segment.
for (const width of [320, 375, 390, 414]) {
  test(`Review | Apply: equal segments, a 99+ count, fit at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await manyPostings(page, 120);
    await seed(page);
    await page.goto('/#/review');
    const nav = page.getByRole('navigation', { name: 'Sections' });
    const review = nav.getByRole('link', { name: /^Review/ });
    await expect(review).toHaveAccessibleName('Review 99+');
    const apply = nav.getByRole('link', { name: /^Apply/ });
    await expect(apply).toHaveAccessibleName('Apply');
    const [rev, app] = [await review.boundingBox(), await apply.boundingBox()];
    expect(Math.abs(rev!.width - app!.width)).toBeLessThan(1);
    expect(Math.abs(rev!.y - app!.y)).toBeLessThan(1);
    expect(rev!.height).toBeGreaterThanOrEqual(44);
    const navBox = await nav.boundingBox();
    expect(navBox!.x + navBox!.width).toBeLessThanOrEqual(width);
    const pill = await nav.locator('.rjb-seg-count').boundingBox();
    if (width < 400) expect(pill!.width).toBeLessThanOrEqual(1);
    // From 400 the pill shows, inside its segment.
    else expect(pill!.x + pill!.width).toBeLessThanOrEqual(rev!.x + rev!.width);
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
    await page.goto('/#/review');
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

/** n synthetic design-system postings from one Hacker News thread; every other host answers empty
 *  (no real people). Review reads them as new, so its tab shows the count. */
async function manyPostings(page: Page, n: number) {
  await page.route(/^https?:\/\/(?!localhost)/, (r) => {
    const url = r.request().url();
    const json = (body: unknown) =>
      r.fulfill({
        status: 200,
        headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    if (url.startsWith('https://remotive.com/') || url.startsWith('https://jobicy.com/'))
      return json({ jobs: [] });
    if (url.startsWith('https://api.lever.co/')) return json([]);
    if (/^https:\/\/(boards-api\.greenhouse\.io|api\.ashbyhq\.com)\//.test(url))
      return json({ jobs: [] });
    if (!url.startsWith('https://hn.algolia.com/')) return r.abort();
    if (url.includes('search_by_date'))
      return json({
        hits: [
          {
            objectID: '9',
            title: 'Ask HN: Who is hiring? (October 2026)',
            created_at: '2026-10-01',
          },
        ],
      });
    return json({
      hits: Array.from({ length: n }, (_, i) => ({
        objectID: `p-${i}`,
        story_id: 9,
        parent_id: 9,
        created_at: new Date().toISOString(),
        comment_text: `Co${i} | Design Systems Engineer | Remote<p>Own our design system.</p>`,
      })),
    });
  });
}
