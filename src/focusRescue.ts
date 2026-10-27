// Focus is never dropped (a11y audit, 2026-10-27). When the focused element leaves the page, the
// browser hands focus to <body>: a screen reader says nothing, and Tab starts again from the top
// of the page. Two cases come back here:
// - a page change (a job's title, a Back link, the browser's Back) moves focus to the new page's
//   heading, so its name is read and Tab goes on from the top of it. The heading takes focus
//   (tabindex -1) but is no tab stop and draws no ring (base.css `[data-focus-heading]`);
// - a row that leaves a list (Mark applied, Remove, Not a fit) hands focus to what took its place,
//   else to the control before it, else to the page's heading.
// Dialogs and menus are left to Radix, which returns focus to their trigger first; when that
// trigger left with its row (Remove from a row menu), the row's place is used as above.
// Set up once in main.tsx, like scroll memory; component tests run without it.
import { getRoute, pageKey, subscribeRoute } from './route';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
/** Open overlays: focus inside one never becomes the spot (its trigger's spot is kept). */
const OVERLAY =
  '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [data-radix-popper-content-wrapper]';
/** How long a page change waits for its heading (a lazy view on a slow link, a job still loading);
 *  a click or anything taking focus first ends the wait. */
const HEADING_WAIT_MS = 10_000;

/** Where an element sat: it and each ancestor, with the siblings on either side. */
export type Spot = { node: Element; prev: Element | null; next: Element | null }[];

export function spotOf(el: Element): Spot {
  const spot: Spot = [];
  for (let n: Element | null = el; n && n !== document.body; n = n.parentElement)
    spot.push({ node: n, prev: n.previousElementSibling, next: n.nextElementSibling });
  return spot;
}

/** Shown and reachable: not hidden, inert or aria-hidden, and laid out. */
const shownInBrowser = (el: Element) =>
  !el.closest('[hidden], [inert], [aria-hidden="true"]') && el.getClientRects().length > 0;

/** The page's heading: the first h1 or h2 in main outside a side rail (the job rail's list). */
export function pageHeading(shown = shownInBrowser): HTMLElement | null {
  const main = document.querySelector('main');
  if (!main) return null;
  for (const h of main.querySelectorAll<HTMLElement>('h1, h2'))
    if (!h.closest('nav, aside') && shown(h)) return h;
  return null;
}

const FOLLOWING = 4; // Node.DOCUMENT_POSITION_FOLLOWING

/** What takes focus once the element at `spot` has gone: the first control after its place in the
 *  nearest container still on the page, else the last one before it, going out a level at a time
 *  (up to main). Null while the element is still on the page, or when nothing is left. */
export function successor(spot: Spot, shown = shownInBrowser): HTMLElement | null {
  const k = spot.findIndex((s) => s.node.isConnected);
  if (k <= 0) return null;
  let { prev, next } = spot[k - 1];
  for (let j = k; j < spot.length; j++) {
    const box = spot[j].node;
    if (!box.isConnected) break;
    const p = prev?.isConnected && box.contains(prev) ? prev : null;
    const n = next?.isConnected && box.contains(next) ? next : null;
    const after = (c: Element) =>
      p
        ? !!(p.compareDocumentPosition(c) & FOLLOWING) && !p.contains(c)
        : n
          ? c === n || n.contains(c) || !!(n.compareDocumentPosition(c) & FOLLOWING)
          : true;
    const all = [...box.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(shown);
    const hit = all.find(after) ?? all.reverse().find((c) => !after(c));
    if (hit) return hit;
    if (box.matches('main')) break;
    // Nothing left in this box: look around the box itself one level out.
    prev = box;
    next = null;
  }
  return null;
}

function focusHeading(shown: (el: Element) => boolean): boolean {
  const h = pageHeading(shown);
  if (!h) return false;
  if (!h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1');
  h.setAttribute('data-focus-heading', '');
  h.focus({ preventScroll: true });
  return document.activeElement === h;
}

const lost = () => {
  const a = document.activeElement;
  return !a || a === document.body || !a.isConnected;
};

let installed = false;

/** `shown` is for tests (jsdom has no layout). */
export function installFocusRescue(shown = shownInBrowser): void {
  if (installed || typeof MutationObserver === 'undefined') return;
  installed = true;
  let spot: Spot | null = null;
  let page = pageKey(getRoute());
  /** A page change whose heading may still need focus, and since when: until something else
   *  takes focus, a click, or HEADING_WAIT_MS. (The old page can linger a moment, focus still on
   *  its link, and a heading focused early can be a loading one that goes again.) */
  let pageChanged = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const check = () => {
    timer = undefined;
    if (!lost()) return;
    if (pageChanged && Date.now() - pageChanged < HEADING_WAIT_MS) {
      // No heading yet (a lazy view, a job still loading): the page's next change looks again.
      focusHeading(shown);
      return;
    }
    pageChanged = 0;
    if (spot && !spot[0].node.isConnected) {
      const to = successor(spot, shown);
      if (to) to.focus({ preventScroll: true });
      else focusHeading(shown);
    }
  };
  // Later than Radix's own focus return (a setTimeout 0 when a menu or dialog closes).
  const schedule = () => {
    if (timer === undefined) timer = setTimeout(check, 30);
  };

  document.addEventListener('focusin', (e) => {
    const t = e.target as Element;
    if (!(t instanceof Element) || t === document.body) return;
    // Something else took focus: the page change is done with. (The heading it focused is not.)
    if (!t.hasAttribute('data-focus-heading')) pageChanged = 0;
    if (!t.closest(OVERLAY)) spot = spotOf(t);
  });
  // A click on the page while its heading is awaited: the user is elsewhere, leave focus alone.
  document.addEventListener('pointerdown', () => (pageChanged = 0), true);
  document.addEventListener('focusout', (e) => {
    const t = e.target as Element;
    // The user moved focus off it (a click on the page): it stays, so nothing is to be handed on.
    setTimeout(() => {
      if (spot?.[0].node === t && t.isConnected && lost()) spot = null;
    }, 0);
  });
  new MutationObserver(() => {
    if (spot || pageChanged) schedule();
  }).observe(document.body, { childList: true, subtree: true });
  subscribeRoute(() => {
    const next = pageKey(getRoute());
    if (next === page) return;
    page = next;
    pageChanged = Date.now();
    spot = null;
    schedule();
  });
}
