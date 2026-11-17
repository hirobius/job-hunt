// Clipped controls (button bottom edge cut flat, reported many times): a control's painted box,
// its border box plus the outer extent of its box-shadow (the HDS Button's 3px hard edge is a
// box-shadow drawn below its layout box), must sit inside every ancestor that clips: overflow
// other than visible, or contain: paint. A scroller clips at the end of its scrollable area, not
// at its viewport (a box-shadow adds nothing to that area, so the last row's edge is cut there).
import type { Page } from './fixtures';

export const CONTROLS =
  'button, a[href], summary, select, textarea, input:not([type="hidden"]), [role="button"], [role="tab"], [role="switch"], [role="menuitem"], [role="menuitemradio"], [role="radio"], [role="checkbox"], [role="combobox"], [role="option"]';

/** One line per control whose painted box an ancestor cuts, e.g. `button[Scan now] bottom 3px by div.find-list`. */
export function findClipped(page: Page): Promise<string[]> {
  return page.evaluate((selector) => {
    const out: string[] = [];
    const TOL = 0.5;
    const label = (el: Element) =>
      `${el.tagName.toLowerCase()}[${(el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30)}]`;
    const name = (el: Element) => {
      const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/)[0] : '';
      return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${cls ? `.${cls}` : ''}`;
    };
    // Outer extents of every non-inset, non-transparent shadow: [top, right, bottom, left].
    const shadowExtent = (cs: CSSStyleDeclaration) => {
      const e = [0, 0, 0, 0];
      const v = cs.boxShadow;
      if (!v || v === 'none') return e;
      const parts: string[] = [];
      let depth = 0;
      let cur = '';
      for (const ch of v) {
        if (ch === '(') depth++;
        if (ch === ')') depth--;
        if (ch === ',' && depth === 0) {
          parts.push(cur);
          cur = '';
        } else cur += ch;
      }
      parts.push(cur);
      for (const p of parts) {
        if (/\binset\b/.test(p)) continue;
        const color =
          p.match(/rgba?\([^)]*\)|color\([^)]*\)|oklch\([^)]*\)|transparent/)?.[0] ?? '';
        if (color === 'transparent' || /^rgba\([^)]*,\s*0\)$|\/\s*0\)$/.test(color)) continue;
        const n = p
          .replace(color, '')
          .trim()
          .split(/\s+/)
          .map(parseFloat)
          .filter((x) => !Number.isNaN(x));
        const [x = 0, y = 0, blur = 0, spread = 0] = n;
        const r = blur + spread;
        e[0] = Math.max(e[0], r - y);
        e[1] = Math.max(e[1], r + x);
        e[2] = Math.max(e[2], r + y);
        e[3] = Math.max(e[3], r - x);
      }
      return e;
    };
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      if (r.width <= 1 || r.height <= 1) return false;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') return false;
      // An ancestor at opacity 0 (a view on its way out) hides it too.
      return el.checkVisibility({ opacityProperty: true, visibilityProperty: true });
    };
    // With a menu or dialog open, only its controls are judged (the page under it is covered).
    const layers = [
      ...document.querySelectorAll<HTMLElement>(
        '[role="menu"],[role="dialog"],[role="alertdialog"]',
      ),
    ].filter(
      (l) => l.getBoundingClientRect().height > 1 && !l.closest('[inert],[aria-hidden="true"]'),
    );
    const scope: ParentNode = layers.at(-1) ?? document;
    scope.querySelectorAll(selector).forEach((el) => {
      if (!visible(el) || el.closest('[inert],[aria-hidden="true"]')) return;
      // A control inside another control is measured as the outer one.
      if (el.parentElement?.closest(selector)) return;
      const r = el.getBoundingClientRect();
      const [st, sr, sb, sl] = shadowExtent(getComputedStyle(el));
      const box = {
        top: r.top - st,
        right: r.right + sr,
        bottom: r.bottom + sb,
        left: r.left - sl,
      };
      for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (cs.display === 'contents') continue;
        const paint = /paint|strict|content/.test(cs.contain);
        const cx = cs.overflowX !== 'visible' || paint;
        const cy = cs.overflowY !== 'visible' || paint;
        if (!cx && !cy) continue;
        // The body is the page's scroller (HDS sets overflow-x hidden on html and body).
        if (p === document.body) continue;
        const pr = p.getBoundingClientRect();
        const bl = parseFloat(cs.borderLeftWidth);
        const bt = parseFloat(cs.borderTopWidth);
        // The padding box, stretched to the scrollable area in a scroller.
        const scrollsX = cs.overflowX === 'auto' || cs.overflowX === 'scroll';
        const scrollsY = cs.overflowY === 'auto' || cs.overflowY === 'scroll';
        const left = pr.left + bl - p.scrollLeft;
        const top = pr.top + bt - p.scrollTop;
        const clip = {
          left,
          top,
          right: left + (scrollsX ? Math.max(p.scrollWidth, p.clientWidth) : p.clientWidth),
          bottom: top + (scrollsY ? Math.max(p.scrollHeight, p.clientHeight) : p.clientHeight),
        };
        // A control scrolled out of view, or hidden whole by a collapsed region, is not cut.
        if (
          r.bottom <= clip.top ||
          r.top >= clip.bottom ||
          r.right <= clip.left ||
          r.left >= clip.right
        )
          break;
        const cuts: string[] = [];
        if (cy && box.top < clip.top - TOL) cuts.push(`top ${(clip.top - box.top).toFixed(1)}px`);
        if (cy && box.bottom > clip.bottom + TOL)
          cuts.push(`bottom ${(box.bottom - clip.bottom).toFixed(1)}px`);
        if (cx && box.left < clip.left - TOL)
          cuts.push(`left ${(clip.left - box.left).toFixed(1)}px`);
        if (cx && box.right > clip.right + TOL)
          cuts.push(`right ${(box.right - clip.right).toFixed(1)}px`);
        if (cuts.length) {
          out.push(`${label(el)} ${cuts.join(', ')} by ${name(p)}`);
          break;
        }
        // Past a scroller, the control is scrolled content: outer clips cut only its viewport.
        if (scrollsX || scrollsY) break;
      }
    });
    return out;
  }, CONTROLS);
}
