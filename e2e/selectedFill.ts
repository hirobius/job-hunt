import type { Locator } from '@playwright/test';

/** How a selected / current item is drawn (#603): a fill only, no edge, ring or outline; a fill
 *  that differs from the unselected item beside it, from that item while hovered (a hovered row
 *  must never look selected), and that stays when the selected item itself is hovered. */
export async function selectionStyle(selected: Locator, other: Locator) {
  const page = selected.page();
  const read = (l: Locator) =>
    l.evaluate(async (el) => {
      // Card fills transition (0.3s): read the settled colour, not a frame mid-way.
      await Promise.all(el.getAnimations().map((a) => a.finished.catch(() => undefined)));
      const cs = getComputedStyle(el);
      const edges = ['top', 'right', 'bottom', 'left'].filter(
        (s) =>
          parseFloat(cs.getPropertyValue(`border-${s}-width`)) > 0 &&
          cs.getPropertyValue(`border-${s}-style`) !== 'none' &&
          !/^transparent$|rgba\([^)]*,\s*0\)$/.test(cs.getPropertyValue(`border-${s}-color`)),
      );
      return { bg: cs.backgroundColor, boxShadow: cs.boxShadow, outline: cs.outlineStyle, edges };
    });
  // A focus ring is not the selection: move focus off both items and the pointer away first.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.mouse.move(0, 0);
  const [a, b] = [await read(selected), await read(other)];
  await other.hover();
  const hovered = await read(other);
  await selected.hover();
  const selectedHovered = await read(selected);
  await page.mouse.move(0, 0);
  return {
    boxShadow: a.boxShadow,
    outline: a.outline,
    edges: a.edges,
    fillDiffers: a.bg !== b.bg && a.bg !== 'rgba(0, 0, 0, 0)',
    hoverDiffers: hovered.bg !== a.bg,
    keptOnHover: selectedHovered.bg === a.bg,
  };
}

export const FILL_ONLY = {
  boxShadow: 'none',
  outline: 'none',
  edges: [],
  fillDiffers: true,
  hoverDiffers: true,
  keptOnHover: true,
};
