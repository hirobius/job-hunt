// Layout rules (redesign-mobile guardrail, docs/guardrails.md): every route at 390 and 1440,
// light and dark, holds the mobile-first rules the rev-3 mock was approved on:
//   - no horizontal page overflow
//   - every interactive target at least 40px tall on a phone
//   - no text below the HDS caption size
//   - one status rule: never two status badges beside a title
//   - headings sit on the HDS type ramp, and no inline font size anywhere
//   - a page side gutter of at least 16px on a phone
//   - no italic text (HDS 0.30's EmptyState title is italic; hds-gaps/EmptyState resets it)
// Local only: `npm run verify:ui` (or `npm run test:e2e`).
import { test, expect, type Page } from '@playwright/test';
import { seed, visitAll } from './routes';

const THEMES = ['light', 'dark'] as const;
const WIDTHS = [390, 1440] as const;
const PHONE = 600;
const GUTTER = 16;
// KNOWN_DEBT: none. The redesign cleared the last two (slice 1): the 12px phone gutter (now 16,
// rev-3 mock) and the job rail's "Due" beside a status badge (now one badge row above the
// title, rev-3 B). A new debt needs a reason here and an exact-form check in probe().

/** Run every rule in the page; returns one line per offence. */
function probe(page: Page) {
  return page.evaluate(
    ({ phone, gutter }) => {
      const out: string[] = [];
      const W = document.documentElement.clientWidth;
      const isPhone = W < phone;
      const label = (el: Element) =>
        `${el.tagName.toLowerCase()}[${(el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30)}]`;
      const visible = (el: Element) => {
        const r = el.getBoundingClientRect();
        // 1px boxes are visually-hidden labels (sr-only), not layout.
        if (r.width <= 1 || r.height <= 1) return false;
        const cs = getComputedStyle(el);
        return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0;
      };
      // An element inside a horizontal scroller (a phone tab row) may sit past the edge on purpose.
      const inScroller = (el: Element) => {
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
          const ox = getComputedStyle(p).overflowX;
          if (
            (ox === 'auto' || ox === 'scroll' || ox === 'hidden') &&
            p.scrollWidth > p.clientWidth + 1
          )
            return true;
        }
        return false;
      };
      // The HDS ramp, resolved to px from its own tokens.
      const px = (v: string) => {
        const s = document.createElement('span');
        s.style.fontSize = `var(${v})`;
        document.body.appendChild(s);
        const n = parseFloat(getComputedStyle(s).fontSize);
        s.remove();
        return n;
      };
      // titleSm joined the ramp in HDS 0.29 (Alert titles use it).
      const RAMP = ['display', 'title', 'titleSm', 'body', 'ui', 'caption', 'mono'].map((k) =>
        px(`--semantic-typography-${k}-font-size`),
      );
      const CAPTION = px('--semantic-typography-caption-font-size');

      // 1. No horizontal page overflow.
      const sw = document.documentElement.scrollWidth;
      if (sw > W + 1) out.push(`overflow: page is ${sw}px wide in a ${W}px viewport`);

      // 2. Touch targets (phone): 40px tall; icon-only ones 40px wide too.
      if (isPhone)
        document
          .querySelectorAll(
            'button, [role="button"], [role="tab"], [role="menuitem"], [role="radio"], [role="combobox"], select, input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]), textarea',
          )
          .forEach((el) => {
            if (!visible(el)) return;
            // HDS's own clear-input button is 30px wide (hds#750).
            if (el.getAttribute('aria-label') === 'Clear input') return;
            // A chip input's text field (HDS creatable Combobox) is 28px, but its 40px field is the
            // target: a press anywhere on the field focuses it.
            const field = el.getAttribute('role') === 'combobox' && el.closest('[role="group"]');
            if (field && field.getBoundingClientRect().height >= 39.5) return;
            const r = el.getBoundingClientRect();
            const iconOnly = !(el.textContent || '').trim() && el.tagName !== 'INPUT';
            if (r.height < 39.5 || (iconOnly && r.width < 39.5))
              out.push(`target: ${label(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
          });

      // 3–6. Per element: text size, inline font size, heading ramp, gutter.
      document.querySelectorAll('body *').forEach((el) => {
        if (!(el instanceof HTMLElement) || !visible(el)) return;
        const cs = getComputedStyle(el);
        // HDS Text sets its ramp as inline token vars; anything else inline is off the ramp.
        const fs = el.style.fontSize;
        if (fs && !/^var\(--semantic-typography-[a-zA-Z]+-font-size\)$/.test(fs))
          out.push(`inline font: ${label(el)} font-size: ${fs}`);
        const ownText = [...el.childNodes].some(
          (n) => n.nodeType === Node.TEXT_NODE && (n.textContent || '').trim(),
        );
        // 7. No italic (rev-3: no italic anywhere; HDS 0.30's EmptyState title is italic).
        if (ownText && cs.fontStyle === 'italic') out.push(`italic: ${label(el)}`);
        if (ownText && parseFloat(cs.fontSize) < CAPTION - 0.1)
          out.push(`text size: ${label(el)} ${cs.fontSize} < caption ${CAPTION}px`);
        if (
          /^H[1-6]$/.test(el.tagName) &&
          !RAMP.some((s) => Math.abs(s - parseFloat(cs.fontSize)) < 0.1)
        )
          out.push(`ramp: ${label(el)} ${cs.fontSize} is not an HDS type size`);
        if (
          isPhone &&
          ownText &&
          !inScroller(el) &&
          !el.closest('[role="dialog"], [role="menu"]')
        ) {
          const r = el.getBoundingClientRect();
          const edge = Math.min(r.left, W - r.right);
          if (edge < gutter - 0.5)
            out.push(
              `gutter: ${label(el)} spans ${Math.round(r.left)}–${Math.round(r.right)} of ${W}`,
            );
        }
      });

      // 4. One status rule: at most one status badge on a title's line (rev-3 B: the rest go
      // in one badge row above the title). An HDS Badge is the span sized by its badge tokens.
      // A job link may wrap its whole row (the job rail), so its title is its first text.
      const titleText = (el: Element): Element => {
        if (/^H[1-6]$/.test(el.tagName)) return el;
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode())
          if ((n.textContent || '').trim() && n.parentElement && visible(n.parentElement))
            return n.parentElement;
        return el;
      };
      document.querySelectorAll('h1, h2, h3, h4, h5, h6, a[href^="#/queue/"]').forEach((el) => {
        if (!visible(el)) return;
        const title = titleText(el);
        const scope =
          el.matches('a') && el.querySelector('[class*="--component-badge-height"]')
            ? el
            : (el.parentElement?.parentElement ?? el.parentElement);
        if (!scope) return;
        const t = title.getBoundingClientRect();
        const badges = [...scope.querySelectorAll('[class*="--component-badge-height"]')].filter(
          (b) => {
            if (!visible(b) || title.contains(b) || b.contains(title)) return false;
            const r = b.getBoundingClientRect();
            const mid = (r.top + r.bottom) / 2;
            return mid >= t.top && mid <= t.bottom;
          },
        );
        if (badges.length > 1)
          out.push(
            `status: ${label(title)} has ${badges.length} badges beside it (${badges.map((b) => b.textContent?.trim()).join(', ')})`,
          );
      });
      return [...new Set(out)];
    },
    { phone: PHONE, gutter: GUTTER },
  );
}

for (const theme of THEMES) {
  for (const width of WIDTHS) {
    test.describe(`${theme} ${width}`, () => {
      test.use({ viewport: { width, height: width < PHONE ? 844 : 900 }, colorScheme: theme });

      test('every route holds the layout rules', async ({ page }) => {
        test.setTimeout(120_000);
        await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
        await page.addInitScript((t) => localStorage.setItem('rjb_color_mode', t), theme);
        await seed(page);
        const bad: string[] = [];
        await visitAll(page, async (name) => {
          for (const line of await probe(page)) bad.push(`${name} ${line}`);
        });
        expect(bad).toEqual([]);
      });

      // The first screen a new user sees: the empty Pipeline (its teaching EmptyState), before
      // any sample data, and the Pipeline filtered to nothing.
      test('the empty and filtered-empty Pipeline hold the layout rules', async ({ page }) => {
        await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
        await page.addInitScript((t) => localStorage.setItem('rjb_color_mode', t), theme);
        await page.goto('/#/queue');
        await expect(page.getByText('Track your first job')).toBeVisible();
        expect(await probe(page)).toEqual([]);
        await seed(page);
        await page.evaluate(() => (location.hash = '#/queue'));
        await page.getByRole('textbox', { name: 'Search saved jobs' }).fill('zzz nothing');
        await expect(page.getByText(/No saved jobs match/)).toBeVisible();
        expect(await probe(page)).toEqual([]);
      });
    });
  }
}
