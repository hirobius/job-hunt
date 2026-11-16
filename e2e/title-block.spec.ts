import { test, expect } from './fixtures';
import { seed } from './routes';

// The title block (#538): the title at typography.title (24px, wraps in full), the company, one
// facts line with 16px icons, and no fit, Saved or blue chips.
for (const width of [390, 1440]) {
  test.describe(`title block ${width}`, () => {
    test.use({ viewport: { width, height: width === 390 ? 844 : 900 } });

    test('title, company, facts; no fit or Saved chip, no blue', async ({ page }) => {
      await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
      await seed(page);
      await page.goto('/#/apply');
      const block = page.locator('[data-rjb-title-block]');
      const h1 = block.getByRole('heading', { level: 1 });
      await expect(h1).toBeVisible();
      expect(await h1.evaluate((e) => getComputedStyle(e).fontSize)).toBe('24px');
      // A long title wraps: never an ellipsis.
      expect(await h1.evaluate((e) => getComputedStyle(e).textOverflow)).not.toBe('ellipsis');
      const facts = block.getByRole('list');
      await expect(facts).toBeVisible();
      const icons = facts.locator('svg');
      expect(await icons.count()).toBeGreaterThanOrEqual(2);
      const size = await icons.first().evaluate((s) => s.getBoundingClientRect().width);
      expect(size).toBe(16);
      // Title above the facts.
      const hb = (await h1.boundingBox())!;
      expect((await facts.boundingBox())!.y).toBeGreaterThan(hb.y);
      await expect(block.getByText('Strong fit', { exact: true })).toHaveCount(0);
      await expect(block.getByText('Saved', { exact: true })).toHaveCount(0);
      await expect(block.locator('[data-tone="info"]')).toHaveCount(0);
    });

    // The amber badge (hds-gaps/IconBadge): HDS Badge trims its child to the cap height and
    // clips, so the icon must not move the text off the badge's centre line (it sat 2px high,
    // its top cut).
    test('the Follow-up due badge keeps its text and icon inside its box, centred', async ({
      page,
    }) => {
      await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
      await seed(page);
      await page.goto('/#/apply');
      if (width < 1024) {
        await page.getByRole('button', { name: /^View: / }).click();
        await page.getByRole('menuitemradio', { name: /^Follow up/ }).click();
      } else {
        await page
          .locator('.job-rail')
          .getByRole('group', { name: 'Views' })
          .getByRole('button', { name: /^Follow up/ })
          .click();
      }
      const badge = page.locator('[data-rjb-title-block] [data-tone="warning"]').first();
      await expect(badge).toContainText('Follow-up due');
      const m = await badge.evaluate((b) => {
        const box = b.getBoundingClientRect();
        const icon = b.querySelector('svg')!.getBoundingClientRect();
        const range = document.createRange();
        const text = [...b.querySelectorAll('span')].pop()!;
        range.selectNodeContents(text);
        const ink = range.getBoundingClientRect();
        const mid = (r: DOMRect) => r.top + r.height / 2;
        return {
          iconInside: icon.top >= box.top && icon.bottom <= box.bottom,
          iconOff: Math.abs(mid(icon) - mid(box)),
          textOff: Math.abs(mid(ink) - mid(box)),
        };
      });
      expect(m.iconInside).toBe(true);
      expect(m.iconOff).toBeLessThanOrEqual(1);
      expect(m.textOff).toBeLessThanOrEqual(1.5);
    });
  });
}
