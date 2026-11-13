// No outlines on surfaces (Adrian 2026-10-22: "none of the cards or surfaces have outlines"):
// every route at 390 and 1440, light and dark. A Card, a panel or any other container separates
// by its HDS surface fill and spacing, never a stroke. Two checks:
//   1. every HDS Card (`[data-bordered]`) computes no visible border on any side;
//   2. no other container-sized box draws a visible border on all four sides.
// Borders that carry meaning stay: inputs and other controls, focus rings, selected and current
// states, overlays (HDS 0.31 gives them a hairline), table and list row dividers (one side only)
// and feedback tones (alerts, status).
// Local only: `npm run test:e2e`.
import { test, expect, type Page } from '@playwright/test';
import { seed, visitAll } from './routes';
import { FILL_ONLY, selectionStyle } from './selectedFill';

/** One line per surface that draws an outline. */
function probe(page: Page) {
  return page.evaluate(() => {
    const out: string[] = [];
    const label = (el: Element) =>
      `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/).slice(0, 3).join('.')}` : ''}[${(el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30)}]`;
    const SIDES = ['Top', 'Right', 'Bottom', 'Left'] as const;
    const drawn = (cs: CSSStyleDeclaration, side: (typeof SIDES)[number]) => {
      const w = parseFloat(cs.getPropertyValue(`border-${side.toLowerCase()}-width`));
      const style = cs.getPropertyValue(`border-${side.toLowerCase()}-style`);
      const color = cs.getPropertyValue(`border-${side.toLowerCase()}-color`);
      const transparent = color === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(color);
      return w > 0 && style !== 'none' && style !== 'hidden' && !transparent;
    };
    const shown = (el: Element) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 1 && r.height > 1 && cs.visibility !== 'hidden' && cs.display !== 'none';
    };
    // Controls, states and overlays whose edge means something.
    const MEANING = [
      'input',
      'textarea',
      'select',
      'button',
      'a',
      'label',
      '[contenteditable]',
      '[role=button]',
      '[role=tab]',
      '[role=radio]',
      '[role=checkbox]',
      '[role=switch]',
      '[role=combobox]',
      '[role=option]',
      '[role=menuitem]',
      '[role=slider]',
      '[role=textbox]',
      '[aria-current]',
      '[aria-selected=true]',
      '[data-state=checked]',
      '[role=alert]',
      '[role=status]',
      '[role=dialog]',
      '[role=alertdialog]',
      '[role=menu]',
      '[role=listbox]',
      '[role=tooltip]',
      '[data-radix-popper-content-wrapper]',
      '[data-sonner-toast]',
      // HDS toasts float over the page (an overlay); since #534 they survive navigation.
      '.hds-toast',
    ].join(',');
    for (const el of document.querySelectorAll('body *')) {
      if (!shown(el)) continue;
      const cs = getComputedStyle(el);
      if (el.hasAttribute('data-bordered')) {
        const sides = SIDES.filter((s) => drawn(cs, s));
        if (sides.length) out.push(`card outline (${sides.join(', ')}): ${label(el)}`);
        continue;
      }
      if (el.closest(MEANING)) continue;
      // A field's own frame (an HDS Input wraps its <input> in the box that draws the edge).
      if (el.querySelector(':scope > input, :scope > textarea, :scope > * > input')) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 120 || r.height < 40) continue;
      if (SIDES.every((s) => drawn(cs, s))) out.push(`surface outline: ${label(el)}`);
    }
    return [...new Set(out)];
  });
}

for (const theme of ['light', 'dark'] as const)
  for (const width of [390, 1440] as const)
    test(`${theme} ${width}: no surface draws an outline`, async ({ page }) => {
      test.setTimeout(180_000);
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme });
      await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
      await page.addInitScript((t) => localStorage.setItem('rjb_color_mode', t), theme);
      await seed(page);
      const offences: string[] = [];
      await visitAll(page, async (name) => {
        for (const line of await probe(page)) offences.push(`${name}: ${line}`);
      });
      expect(offences, offences.join('\n')).toEqual([]);
    });

// The Apply rail's open job (#603): a stronger surface fill, never an edge marker.
for (const theme of ['light', 'dark'] as const)
  test(`${theme} 1440: the open job in the rail is a fill, not an edge`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
    await page.addInitScript((t) => localStorage.setItem('rjb_color_mode', t), theme);
    await seed(page);
    await page.goto('/#/apply');
    const rows = page.locator('.job-rail li');
    const open = page.locator('.job-rail li:has(> [aria-current="page"])');
    await expect(open).toHaveCount(1);
    const other = rows.filter({ hasNot: page.locator(':scope > [aria-current="page"]') }).first();
    expect(await selectionStyle(open, other)).toEqual(FILL_ONLY);
  });
