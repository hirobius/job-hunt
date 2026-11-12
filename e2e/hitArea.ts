import type { Locator } from '@playwright/test';

/** A small key's 44px hit area (`.rjb-hit-44`'s ::after, Find's Review row): its box, and whether a
 *  tap 2px inside each edge (and the middle of each edge) lands on that key and no other. */
export async function hitArea(key: Locator) {
  return key.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const a = getComputedStyle(el, '::after');
    const box = {
      left: r.left + parseFloat(a.left),
      top: r.top + parseFloat(a.top),
      width: parseFloat(a.width),
      height: parseFloat(a.height),
    };
    const { left, top, width, height } = box;
    const xs = [left + 2, left + width / 2, left + width - 2];
    const ys = [top + 2, top + height / 2, top + height - 2];
    const misses: string[] = [];
    for (const x of xs)
      for (const y of ys) {
        const hit = document.elementFromPoint(x, y);
        if (!hit || hit.closest('button, a') !== el)
          misses.push(
            `${Math.round(x)},${Math.round(y)} → ${hit?.closest('button, a')?.getAttribute('aria-label') ?? hit?.tagName}`,
          );
      }
    return { width, height, misses };
  });
}
