import type { Locator } from '@playwright/test';

/** How a selected / current item is drawn (#603): a fill only, no edge, ring or outline, and a
 *  fill that differs from the unselected item beside it. */
export async function selectionStyle(selected: Locator, other: Locator) {
  const read = (l: Locator) =>
    l.evaluate((el) => {
      const cs = getComputedStyle(el);
      const edges = ['top', 'right', 'bottom', 'left'].filter(
        (s) =>
          parseFloat(cs.getPropertyValue(`border-${s}-width`)) > 0 &&
          cs.getPropertyValue(`border-${s}-style`) !== 'none' &&
          !/^transparent$|rgba\([^)]*,\s*0\)$/.test(cs.getPropertyValue(`border-${s}-color`)),
      );
      return {
        bg: cs.backgroundColor,
        boxShadow: cs.boxShadow,
        outline: cs.outlineStyle,
        edges,
      };
    });
  const [a, b] = [await read(selected), await read(other)];
  return {
    boxShadow: a.boxShadow,
    outline: a.outline,
    edges: a.edges,
    fillDiffers: a.bg !== b.bg && a.bg !== 'rgba(0, 0, 0, 0)',
  };
}

export const FILL_ONLY = { boxShadow: 'none', outline: 'none', edges: [], fillDiffers: true };
