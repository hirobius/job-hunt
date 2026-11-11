import { test, expect, type Page } from '@playwright/test';

// Find / Apply ink sits at the segment's centre (port of HDS tests/visual/
// segmented-control-centering.spec.ts, hds#1461): the label's ink box, from a Range's content box
// and the canvas text metrics of its computed font, is vertically centred within 1px of the link's
// box (the open one's fill above its ledge), at 390 and 1440, light and dark, for the open and the closed segment.
async function inkOffsets(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const ctx = document.createElement('canvas').getContext('2d')!;
    return [...document.querySelectorAll<HTMLElement>(sel)].map((el) => {
      const cs = getComputedStyle(el);
      ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const text = el.textContent!.trim();
      const m = ctx.measureText(text);
      const range = document.createRange();
      range.selectNodeContents(el);
      const r = range.getClientRects()[0];
      const baseline =
        r.top +
        (r.height - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2 +
        m.fontBoundingBoxAscent;
      // The cap band (baseline to cap height): descenders (the p and y of Apply) are not the optical
      // centre, so they are left out, as HDS's check does for its labels.
      const cap = ctx.measureText('H').actualBoundingBoxAscent;
      const inkCentre = baseline - cap / 2;
      const b = el.getBoundingClientRect();
      // The open segment is measured against its coloured fill: the box minus the 3px ledge drawn
      // at its foot (Adrian 2026-11-11: centre on the fill).
      const ledge = el.getAttribute('aria-current') === 'page' ? 3 : 0;
      return { text, offset: inkCentre - (b.top + (b.height - ledge) / 2) };
    });
  }, selector);
}

for (const width of [390, 1440]) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`Find / Apply labels are ink-centred at ${width}, ${scheme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
      await page.emulateMedia({ colorScheme: scheme });
      await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
      await page.goto('/#/apply');
      await expect(page.locator('.rjb-seg')).toHaveCount(2);
      await page.evaluate(() => document.fonts.ready);
      const rows = await inkOffsets(page, '.rjb-seg');
      for (const row of rows) expect(Math.abs(row.offset), row.text).toBeLessThanOrEqual(1);
    });
  }
}
