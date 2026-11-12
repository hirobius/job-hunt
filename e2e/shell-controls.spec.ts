import { test, expect } from '@playwright/test';
import { seed, listScope } from './routes';

// Three controls Adrian approved (2026-11-09), at 390 and 1440: Find / Apply drawn as an HDS
// segmented control but still a nav of links (routing, Back, deep links); Browse / Deck as two
// icon-only toggle buttons with tooltips; Apply's Remote only switch, per device, that narrows the
// pager's "n of N" and the All jobs sheet.
for (const width of [390, 1440]) {
  test.describe(`at ${width}`, () => {
    test.use({ viewport: { width, height: width < 600 ? 844 : 900 } });

    test('Find / Apply: a segmented nav that routes, with Back and deep links', async ({
      page,
    }) => {
      await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
      await page.goto('/#/apply');
      const nav = page.getByRole('navigation', { name: 'Sections' });
      await expect(nav.getByRole('link', { name: 'Apply' })).toHaveAttribute(
        'aria-current',
        'page',
      );
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
        if (width < 600) {
          // Full width under the logo.
          expect(box!.y).toBeGreaterThan(logo!.y + logo!.height - 1);
          expect(box!.width).toBeGreaterThan(width * 0.8);
        } else {
          // Inline in the app bar, on the logo's row.
          expect(Math.abs(box!.y + box!.height / 2 - (logo!.y + logo!.height / 2))).toBeLessThan(
            24,
          );
        }
      }).toPass({ timeout: 10_000 });
      await nav.getByRole('link', { name: 'Find' }).click();
      await expect(page).toHaveURL(/#\/find/);
      await expect(nav.getByRole('link', { name: 'Find' })).toHaveAttribute('aria-current', 'page');
      await page.goBack();
      await expect(page).toHaveURL(/#\/apply/);
      await expect(nav.getByRole('link', { name: 'Apply' })).toHaveAttribute(
        'aria-current',
        'page',
      );
    });

    test('Browse / Deck: icon-only toggle buttons with names and tooltips', async ({ page }) => {
      await seed(page);
      await page.goto('/#/find');
      const group = page.getByRole('group', { name: 'Review view' });
      const browse = group.getByRole('button', { name: 'Browse' });
      const deck = group.getByRole('button', { name: 'Deck' });
      await expect(browse).toHaveAttribute('aria-pressed', 'true');
      await expect(browse).toHaveText('');
      await deck.hover();
      await expect(page.getByRole('tooltip')).toHaveText('Deck');
      await deck.click();
      await expect(deck).toHaveAttribute('aria-pressed', 'true');
      await expect(browse).toHaveAttribute('aria-pressed', 'false');
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
