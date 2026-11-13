// Layout rules (redesign-mobile guardrail, docs/guardrails.md): every route at 390 and 1440,
// light and dark, holds the mobile-first rules the rev-3 mock was approved on:
//   - no horizontal page overflow
//   - every interactive target at least 44px tall on a phone (stacked bare links too)
//   - a segmented control fits the phone content box (no clipped options)
//   - no text below the HDS caption size
//   - one status rule: never two status badges beside a title
//   - headings sit on the HDS type ramp, and no inline font size anywhere
//   - a page side gutter of at least 16px on a phone
//   - the page starts 24 under the tab row on every route (the shell owns that space)
//   - no italic text (HDS 0.30's EmptyState title is italic; hds-gaps/EmptyState resets it)
//   - a back link's arrow sits on the page heading's left edge (no tertiary inset)
// Local only: `npm run verify:ui` (or `npm run test:e2e`).
import { test, expect, type Page } from '@playwright/test';
import { seed, visitAll, listScope, topTab } from './routes';

const THEMES = ['light', 'dark'] as const;
const WIDTHS = [390, 1440] as const;
const PHONE = 600;
const GUTTER = 16;
const RHYTHM = 24;
// KNOWN_DEBT: none. The redesign cleared the last two (slice 1): the 12px phone gutter (now 16,
// rev-3 mock) and the job rail's "Due" beside a status badge (now one badge row above the
// title, rev-3 B). A new debt needs a reason here and an exact-form check in probe().

/** Run every rule in the page; returns one line per offence. */
function probe(page: Page) {
  return page.evaluate(
    ({ phone, gutter, rhythm }) => {
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

      // 2. Touch targets (phone): 44px tall; icon-only ones 44px wide too (retro quick wins).
      if (isPhone)
        document
          .querySelectorAll(
            'button, [role="button"], [role="tab"], [role="menuitem"], [role="radio"], [role="combobox"], select, input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]), textarea',
          )
          .forEach((el) => {
            if (!visible(el)) return;
            // HDS's own clear-input button is 30px wide (hds#750).
            if (el.getAttribute('aria-label') === 'Clear input') return;
            // A small key whose ::after is its 44px hit area (.rjb-hit-44, Find's Review row;
            // review.spec.ts hit-tests that area with elementFromPoint).
            if (el.classList.contains('rjb-hit-44')) {
              const after = getComputedStyle(el, '::after');
              if (parseFloat(after.width) >= 43.5 && parseFloat(after.height) >= 43.5) return;
            }
            // A chip input's text field (HDS creatable Combobox) is 28px, but its 40px field is the
            // target: a press anywhere on the field focuses it.
            const field = el.getAttribute('role') === 'combobox' && el.closest('[role="group"]');
            if (field && field.getBoundingClientRect().height >= 43.5) return;
            const r = el.getBoundingClientRect();
            const iconOnly = !(el.textContent || '').trim() && el.tagName !== 'INPUT';
            if (r.height < 43.5 || (iconOnly && r.width < 43.5))
              out.push(`target: ${label(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
          });
      // 2b. Stacked bare links are a tap list, not prose: WCAG's inline exemption covers a link
      // inside a sentence, not two or more lines that are each just a link ("More ways to find
      // companies" once shipped two 18px links 5px apart). Each must be 44px tall on a phone. A
      // lone title link (a job card's title, a fact) is left to its row's own targets.
      if (isPhone) {
        const loneLine = (a: Element): Element | null => {
          const text = (a.textContent || '').trim();
          if (!text) return null;
          let line = a.parentElement;
          while (line && getComputedStyle(line).display.startsWith('inline'))
            line = line.parentElement;
          return line && (line.textContent || '').trim() === text ? line : null;
        };
        const lines = new Map<Element, Element>();
        document.querySelectorAll('a[href]').forEach((a) => {
          if (!visible(a) || a.closest('[role="dialog"], [role="menu"]')) return;
          const line = loneLine(a);
          if (line) lines.set(line, a);
        });
        lines.forEach((a, line) => {
          const stacked = [line.previousElementSibling, line.nextElementSibling].some(
            (s) => s && lines.has(s),
          );
          const r = a.getBoundingClientRect();
          if (stacked && r.height < 43.5)
            out.push(
              `target: ${label(a)} ${Math.round(r.width)}x${Math.round(r.height)} (stacked bare links)`,
            );
        });
      }

      // 2c. A segmented control (radio row) fits the phone's content box: past the gutter its last
      // options clip mid-word with no cue ("Wint", the YC batch row once). Use a Select, or a
      // scroller with a fade (rev-3 C).
      if (isPhone)
        document.querySelectorAll('[role="radiogroup"]').forEach((g) => {
          if (!visible(g) || g.closest('[role="dialog"], [role="menu"]')) return;
          const over = [...g.querySelectorAll('[role="radio"]')].filter(
            (r) => visible(r) && r.getBoundingClientRect().right > W - gutter + 0.5,
          );
          if (over.length)
            out.push(
              `clipped: ${label(g)} runs to x=${Math.round(Math.max(...over.map((r) => r.getBoundingClientRect().right)))} past the ${W - gutter}px content edge`,
            );
        });

      // 2d. Page rhythm (rev-3 .wrap): the shell owns the space under the tabs. The first thing on
      // every page (its back link or its title) sits 24 under the tab row, never a per-view gap.
      // The tabs are the page bar's (2026-11-12), main's first row: measure from the bar's bottom
      // (Find's tools can make it taller than the tabs), skip a page's .sr-only h1, and allow the
      // 4px a list column gives back for its focus rings (.job-rail's negative margin).
      const tabs = document.querySelector('nav[aria-label="Sections"]');
      const bar = tabs?.parentElement;
      // (Measured with the page at its top: a sticky list column rides over a scrolled page.)
      if (bar && window.scrollY === 0) {
        const barTop = bar.getBoundingClientRect().top;
        let top = Infinity;
        for (let page = bar.nextElementSibling; page; page = page.nextElementSibling)
          if (visible(page))
            page.querySelectorAll('*').forEach((el) => {
              // (A row scrolled up inside a list column sits above the bar: not the page's start.)
              const y = el.getBoundingClientRect().top;
              if (
                visible(el) &&
                !el.closest('.sr-only') &&
                el.getBoundingClientRect().height > 0 &&
                y >= barTop
              )
                top = Math.min(top, y);
            });
        const gap = Math.round(top - bar.getBoundingClientRect().bottom);
        if (top !== Infinity && (gap > rhythm || gap < rhythm - 4))
          out.push(`rhythm: the page starts ${gap}px under the tabs, not ${rhythm}`);
      }

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
        // The logo wordmark is a brand mark at its own size (Adrian 2026-10-24: 19px), not a ramp step.
        if (
          /^H[1-6]$/.test(el.tagName) &&
          !el.classList.contains('rjb-logo-word') &&
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
      // A job link may wrap its whole row (the job rail), so its title is its first text that is
      // not in a badge (the badge row sits above the title).
      const inBadge = (el: Element) => !!el.closest('[class*="--component-badge-height"]');
      const titleText = (el: Element): Element => {
        if (/^H[1-6]$/.test(el.tagName)) return el;
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode())
          if (
            (n.textContent || '').trim() &&
            n.parentElement &&
            visible(n.parentElement) &&
            !inBadge(n.parentElement)
          )
            return n.parentElement;
        return el;
      };
      document.querySelectorAll('h1, h2, h3, h4, h5, h6, a[href^="#/apply/"]').forEach((el) => {
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
      // 8. Back links ("← Pipeline", "Back to companies"): the arrow lines up with the page
      // heading (rev-3), or the dialog's, never inset by the tertiary Button's leading padding.
      const h1 = [...document.querySelectorAll('h1')].find(visible);
      if (h1)
        document.querySelectorAll('a, button').forEach((el) => {
          const name = (el.getAttribute('aria-label') || el.textContent || '').trim();
          const arrow = el.firstElementChild;
          if (!visible(el) || !/^(Back|All documents)/.test(name) || arrow?.tagName !== 'svg')
            return;
          // In a dialog (Documents, #471 slice 4) it lines up with the dialog's own heading.
          const dialog = el.closest('[role="dialog"]');
          const head = dialog ? (dialog.querySelector('h2') ?? h1) : h1;
          const d = Math.round(
            arrow.getBoundingClientRect().left - head.getBoundingClientRect().left,
          );
          if (Math.abs(d) > 1) out.push(`back inset: ${label(el)} arrow is ${d}px off the heading`);
        });
      return [...new Set(out)];
    },
    { phone: PHONE, gutter: GUTTER, rhythm: RHYTHM },
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

      // #447: the focused top tab draws one ring (base.css's outline, not that plus HDS's inset
      // box-shadow ring), its label sits inside the trigger box, and the tab row does not clip it.
      test('the focused top tab draws one ring around its label', async ({ page }) => {
        await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
        await page.addInitScript((t) => localStorage.setItem('rjb_color_mode', t), theme);
        await page.goto('/#/find');
        const tab = topTab(page, 'Find');
        await expect(tab).toBeVisible();
        await page.keyboard.press('Shift'); // a key press first, so focus shows as focus-visible
        await tab.focus();
        await expect(tab).toBeFocused();
        expect(await tab.evaluate((el) => el.matches(':focus-visible'))).toBe(true);
        const r = await tab.evaluate((el) => {
          const cs = getComputedStyle(el);
          // A ring is a drawn outline or a visible box-shadow layer (Tailwind's ring is one).
          const shadows = cs.boxShadow === 'none' ? [] : cs.boxShadow.split(/,(?![^(]*\))/);
          const visibleShadows = shadows.filter((l) => !/rgba\([^)]*,\s*0\)/.test(l));
          const rings =
            (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0 ? 1 : 0) +
            visibleShadows.length;
          const box = el.getBoundingClientRect();
          const range = document.createRange();
          range.selectNodeContents(el);
          const text = range.getBoundingClientRect();
          // Nothing between the tab and the page clips the ring (the old tab row scrolled).
          let clipped = false;
          for (let n = el.parentElement; n && n !== document.body; n = n.parentElement)
            if (
              getComputedStyle(n).overflowX !== 'visible' ||
              getComputedStyle(n).overflowY !== 'visible'
            )
              clipped = true;
          return {
            rings,
            inside: text.left >= box.left && text.right <= box.right + 0.5,
            ringFits: !clipped,
          };
        });
        expect(r).toEqual({ rings: 1, inside: true, ringFits: true });
      });

      // The first screen a new user sees: the empty Pipeline (its teaching EmptyState), before
      // any sample data, and the Pipeline filtered to nothing.
      test('the empty and filtered-empty Pipeline hold the layout rules', async ({ page }) => {
        await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
        await page.addInitScript((t) => localStorage.setItem('rjb_color_mode', t), theme);
        await page.goto('/#/apply');
        await expect(page.getByText('Track your first job')).toBeVisible();
        expect(await probe(page)).toEqual([]);
        await seed(page);
        await page.evaluate(() => (location.hash = '#/apply'));
        // A view with nothing in it (no search since 2026-11-13): Recently closed, from the
        // view chips (the list column at lg, the All jobs sheet below it).
        const phone = (page.viewportSize()?.width ?? 0) < 1024;
        const list = await listScope(page);
        await list
          .getByRole('group', { name: 'Views' })
          .getByRole('button', { name: /^Recently closed/ })
          .click();
        if (phone) {
          await page.keyboard.press('Escape');
          await expect(page.getByRole('dialog', { name: 'All jobs' })).toHaveCount(0);
        }
        // Below lg the page shows the view's empty state; from lg the open job stays and the
        // list column says nothing matches (#614: no "Not in this filter" card there).
        await expect(
          phone
            ? page.getByText('Nothing under “Recently closed”')
            : page.getByText('No jobs match.', { exact: true }),
        ).toBeVisible();
        // The chip's click may scroll it clear of the sticky bar: measure from the top.
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(200);
        expect(await probe(page)).toEqual([]);
      });
    });
  }
}
