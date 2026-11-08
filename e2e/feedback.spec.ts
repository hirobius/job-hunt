import { test, expect, type Locator, type Page } from '@playwright/test';
import { go, openAllJobs, openFilters, openJob, PROD_URL, seed, topTab } from './routes';

// The feedback sweep (#212): every row and page action on the Pipeline, the job page, Documents
// and Companies must change something visible within 300 ms of the press: the page's text (a
// toast, a dialog, a new state), the route, or a new keyframe animation on an element with a box (a
// flash, a pop, a collapse). A press that only changes an aria-label or a colour transition does
// not count. Neither does something going away on its own: picking an item closes its menu whatever
// the item did, and an earlier toast may leave during the press. So open menus, listboxes and
// toasts are left out of the page's text; one that appears, or whose text changes, still counts.
// Every Remove (a Pipeline job, a to-do, an interview, a final copy, a document, an outreach
// target, a track's link or section) collapses its row and offers Undo.
// Timed against the production build (PROD_URL), what people run: the dev server's StrictMode
// double renders and unbundled modules measured dev overhead, not the app, and flaked under
// parallel load (Account → Companies, Star).
test.use({
  baseURL: PROD_URL,
  permissions: ['clipboard-read', 'clipboard-write'],
  viewport: { width: 1440, height: 900 },
});

const LIMIT_MS = 300;

interface Fb {
  start: number;
  seen: number;
  /** What changed first (text and the words, a menu or toast, or an animation), for the message. */
  why: string;
  /** Keyframe animations started since the press: the name and the row (or card) it ran in. */
  anims: { name: string; row: string }[];
}

/** Watch from each press for the first visible change; the page records how long it took. */
async function installWatcher(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __fb: Fb };
    w.__fb = { start: 0, seen: -1, why: '', anims: [] };
    // Menus, listboxes and toasts (a Radix toast is an li in the Notifications region).
    const TRANSIENT =
      '[role="menu"], [role="listbox"], [role="region"][aria-label^="Notifications"] li';
    const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
    const transients = () =>
      new Map(
        [...document.querySelectorAll<HTMLElement>(TRANSIENT)].map((el) => [
          el,
          squash(el.innerText),
        ]),
      );
    /** The page's text without its menus, listboxes and toasts, and the route. */
    const sig = () => {
      let text = squash(document.body.innerText);
      for (const own of transients().values()) {
        const at = own ? text.lastIndexOf(own) : -1;
        if (at >= 0) text = text.slice(0, at) + text.slice(at + own.length);
      }
      return `${squash(text)}|${location.hash}`;
    };
    /** The words a text change took away and added, for the failure message. */
    const diff = (a: string, b: string) => {
      const [x, y] = [a.split(' '), b.split(' ')];
      const gone = x.filter((wd) => !y.includes(wd)).slice(0, 8);
      const added = y.filter((wd) => !x.includes(wd)).slice(0, 8);
      return `-[${gone.join(' ')}] +[${added.join(' ')}]`;
    };
    /** An element that paints: not `display: contents` (an HDS Table row has no box). */
    const boxed = (el: Element | null) =>
      !!el && el.isConnected && getComputedStyle(el).display !== 'contents';
    const keyframes = () =>
      document.getAnimations().filter((a) => {
        if (!(a instanceof CSSAnimation) || a.playState !== 'running') return false;
        const el = (a.effect as KeyframeEffect | null)?.target ?? null;
        return boxed(el) && !el!.closest(TRANSIENT);
      });
    addEventListener(
      'animationstart',
      (e) => {
        const el = e.target as Element;
        if (!boxed(el) || !w.__fb.start) return;
        const row = el.closest('[role="row"], tr, li, article');
        w.__fb.anims.push({ name: e.animationName, row: squash(row?.textContent ?? '') });
      },
      true,
    );
    // A flash or collapse (feedback.ts) is a `data-motion` attribute whose CSS starts a keyframe
    // animation. Read that animation when the attribute lands: under load the row can be gone
    // (collapse, then remove) before its animationstart event is dispatched, which made the
    // check above miss a collapse that did run.
    new MutationObserver((records) => {
      if (!w.__fb.start) return;
      for (const r of records) {
        const el = r.target as Element;
        if (!el.getAttribute('data-motion') || !boxed(el)) continue;
        const row = el.closest('[role="row"], tr, li, article');
        for (const a of el.getAnimations())
          if (a instanceof CSSAnimation)
            w.__fb.anims.push({ name: a.animationName, row: squash(row?.textContent ?? '') });
      }
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-motion'] });
    addEventListener(
      'pointerdown',
      () => {
        const base = sig();
        const had = transients();
        const before = new Set(keyframes());
        const start = performance.now();
        w.__fb = { start, seen: -1, why: '', anims: [] };
        const tick = () => {
          const t = performance.now() - start;
          if (w.__fb.start !== start) return;
          const now = sig();
          const came = [...transients()].find(([el, text]) => had.get(el) !== text);
          const moved = keyframes().find((a) => !before.has(a)) as CSSAnimation | undefined;
          const why =
            now !== base
              ? `text ${diff(base, now)}`
              : came
                ? `${came[0].getAttribute('role') ?? 'toast'} "${came[1].slice(0, 40)}"`
                : moved
                  ? `animation ${moved.animationName}`
                  : '';
          if (why) {
            Object.assign(w.__fb, { seen: t, why });
            return;
          }
          if (t < 1500) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },
      true,
    );
  });
}

/** The keyframe animations that started since the last press. */
const anims = (page: Page) => page.evaluate(() => (window as unknown as { __fb: Fb }).__fb.anims);

/** Expect `name` to have run in the row (or card) that holds `text`. */
async function ranIn(page: Page, name: string, text: string) {
  await expect
    .poll(() => anims(page), { message: `${name} in the row of ${text}` })
    .toContainEqual({ name, row: expect.stringContaining(text) });
}

/** Press a control and require a visible change within the limit. */
async function press(page: Page, target: Locator, name: string) {
  await target.click();
  await page.waitForFunction(() => {
    const fb = (window as unknown as { __fb: Fb }).__fb;
    return fb.seen >= 0 || performance.now() - fb.start > 1500;
  });
  const { seen, why } = await page.evaluate(() => (window as unknown as { __fb: Fb }).__fb);
  expect(seen, `${name}: nothing visible changed`).toBeGreaterThanOrEqual(0);
  expect(seen, `${name}: took ${Math.round(seen)} ms (${why})`).toBeLessThanOrEqual(LIMIT_MS);
}

const button = (page: Page | Locator, name: string | RegExp) =>
  page.getByRole('button', { name, exact: typeof name === 'string' }).first();
const item = (page: Page, name: string) =>
  page
    .getByRole('menuitem', { name, exact: true })
    .or(page.getByRole('menuitemradio', { name, exact: true }));

/** Open a row's menu (itself an action) and pick an item. */
async function menu(page: Page, trigger: string, choice: string, scope: Page | Locator = page) {
  await press(page, button(scope, trigger), trigger);
  await press(page, item(page, choice), `${trigger} → ${choice}`);
}

async function closeOverlay(page: Page) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
}

test.beforeEach(async ({ page }) => {
  await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  await installWatcher(page);
  await seed(page);
});

test('View enter (#279): the page stack carries the enter motion, and a tab switch replays it', async ({
  page,
}) => {
  const enterName = () =>
    page.evaluate(() => {
      const el = document.querySelector('.rjb-view-enter');
      return el ? getComputedStyle(el).animationName : null;
    });
  await go(page, '#/find');
  await expect(page.locator('.rjb-view-enter')).toHaveCount(1);
  expect(await enterName()).toBe('rjb-view-enter');
  await topTab(page, 'Apply').click();
  await expect(page).toHaveURL(/#\/apply/);
  expect(await enterName()).toBe('rjb-view-enter');
});

test('Today: Scan now and the Account menu’s Companies answer within 300 ms', async ({ page }) => {
  await go(page, '#/find');
  await press(page, button(page, /^(Scan now|Stop scan)$/), 'Scan now');
  await menu(page, 'Account', 'Companies');
  await expect(page.getByRole('dialog', { name: 'Companies' })).toBeVisible();
  await closeOverlay(page);
});

test('Apply list: every row and page action answers within 300 ms', async ({ page }) => {
  // Below lg the list is the All jobs sheet (Proposal A); from lg the list beside a job (#471).
  await page.setViewportSize({ width: 800, height: 900 });
  await go(page, '#/apply');
  const sheet = await openAllJobs(page);
  await press(page, button(sheet, 'Mark applied: Design Technologist'), 'Mark applied');
  await expect(
    page.getByText('Marked applied · Follow up in 7 days', { exact: true }),
  ).toBeVisible();

  // The job's card flashes and collapses (cards at every width, Adrian 2026-10-24); the toast
  // alone is not the item's feedback.
  const row = (t: string, c: string) => menu(page, `More actions: ${t}`, c, sheet);
  await row('Senior Design Systems Designer', 'Star');
  await ranIn(page, 'rjb-flash', 'Senior Design Systems Designer');
  await row('Senior Design Systems Designer', 'Unstar');
  await ranIn(page, 'rjb-flash', 'Senior Design Systems Designer');
  await row('Design Systems Engineer', 'Retire');
  await row('Product Designer, Design Systems', 'Interviewing');
  await ranIn(page, 'rjb-flash', 'Product Designer, Design Systems');
  await row('Principal Design Systems Engineer', 'Remove');
  await ranIn(page, 'rjb-collapse', 'Principal Design Systems Engineer');
  await expect(sheet.getByRole('button', { name: 'Undo' })).toBeVisible();
  await expect(button(sheet, 'More actions: Principal Design Systems Engineer')).toHaveCount(0);

  for (const name of ['Status: Active', 'Sort: Newest']) {
    await press(page, button(sheet, name), name);
    await closeOverlay(page);
  }
  await press(page, button(sheet, 'Follow up: Design Systems Designer'), 'Follow up');
  await closeOverlay(page);
  // The sheet closes; the filter bar holds the page's own actions.
  await closeOverlay(page);
  await expect(sheet).toHaveCount(0);
  await openFilters(page);
  for (const name of ['Add job', 'Clear sample data']) {
    await press(page, button(page, name), name);
    await closeOverlay(page);
  }
  await press(page, button(page, 'Check which are still open'), 'Check which are still open');
});

test('Apply cards (390): Remove collapses the card before it goes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await go(page, '#/apply');
  const sheet = await openAllJobs(page);
  await menu(page, 'More actions: Principal Design Systems Engineer', 'Remove', sheet);
  await ranIn(page, 'rjb-collapse', 'Principal Design Systems Engineer');
  await expect(button(sheet, 'More actions: Principal Design Systems Engineer')).toHaveCount(0);
  await expect(sheet.getByRole('button', { name: 'Undo' })).toBeVisible();
});

test('Job page: every header and panel action answers within 300 ms', async ({ page }) => {
  await openJob(page);
  const star = page.getByRole('button', { name: /^Star(red)?$/ });
  await press(page, star, 'Star toggle');
  await expect(star.locator('svg')).toHaveClass(/rjb-pop/);
  await press(page, star, 'Star toggle back');

  const more = (await page
    .getByRole('button', { name: /^More actions: / })
    .getAttribute('aria-label'))!;
  await menu(page, more, 'Retire');
  await menu(page, more, 'Unretire');
  await menu(page, more, 'Interviewing');

  await press(page, button(page, 'Edit details'), 'Edit details');
  await closeOverlay(page);
  const followUp = (await page
    .getByRole('button', { name: /^Follow up: / })
    .first()
    .getAttribute('aria-label'))!;
  await press(page, button(page, followUp), followUp);
  await closeOverlay(page);
  // Add interview is one item in the job's menu (#416): it opens its dialog.
  await menu(page, more, 'Add interview…');
  await expect(page.getByRole('dialog', { name: 'Add interview' })).toBeVisible();
  await closeOverlay(page);

  // A document link (#416): Add opens the form; Remove collapses its card, then offers Undo.
  const docs = page.getByRole('region', { name: 'Documents' });
  await press(page, button(page, 'Add a document link'), 'Add a document link');
  await docs.getByLabel('Link').fill('https://docs.example/cv');
  await docs.getByRole('button', { name: 'Add link' }).click();
  const removeLink = button(page, 'Remove “docs.example”');
  await press(page, removeLink, 'Remove a document link');
  await ranIn(page, 'rjb-collapse', 'docs.example');
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
  await expect(removeLink).toHaveCount(0);

  await menu(page, more, 'Remove');
  await expect(page).toHaveURL(/#\/apply$/);
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
});

test('Documents: Pin, Duplicate, Copy and Delete answer within 300 ms', async ({ page }) => {
  await go(page, '#/find?documents=');
  const row = button(page, /^Follow-up after applying/);
  await press(page, row, 'Open a document row');
  await press(page, button(page, 'Copy'), 'Copy');

  const more = 'More actions for Follow-up after applying';
  await menu(page, more, 'Pin');
  await expect(
    page.getByRole('listitem', { name: 'Follow-up after applying', exact: true }),
  ).toHaveAttribute('data-motion', 'flash');
  await menu(page, more, 'Unpin');

  await menu(page, more, 'Duplicate');
  const copy = page.getByRole('listitem', { name: 'Follow-up after applying (copy)' });
  await expect(copy).toHaveAttribute('data-motion', 'flash');
  await expect(copy).toBeInViewport();

  // Delete is soft (#329): the row collapses, then Undo brings it back with its Versions.
  await menu(page, more, 'Delete');
  await ranIn(page, 'rjb-collapse', 'Follow-up after applying');
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(
    page.getByRole('listitem', { name: 'Follow-up after applying', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(
    page.getByRole('listitem', { name: 'Follow-up after applying', exact: true }),
  ).toBeVisible();
  // It comes back as it was: still the open row.
  await press(page, button(page, 'Open Follow-up after applying'), 'Open');
  for (const name of ['New résumé', 'New cover letter', 'New outreach message', 'New note']) {
    await go(page, '#/find?documents=');
    await press(page, button(page, name), name);
  }

  // The editor: its menus, the variables panel and Save.
  await go(page, '#/find?documents=tpl-outreach');
  for (const name of ['Insert variable', 'More actions']) {
    await press(page, button(page, name), String(name));
    await closeOverlay(page);
  }
  // Version history opens in place: a second press shuts it (Escape would close Documents itself).
  await press(page, button(page, /^Version history/), 'Version history');
  await button(page, /^Version history/).click();
  await press(page, page.getByRole('combobox', { name: /^Fill for: / }), 'Fill for');
  await closeOverlay(page);
  await press(page, button(page, 'Copy filled text'), 'Copy filled text');
  await press(page, button(page, 'Company'), 'Variable chip');
  await page.getByRole('textbox').first().press('End');
  await page.keyboard.type(' more');
  await press(page, button(page, 'Save'), 'Save');
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('view enter (#279): the page shows at once, with no enter animation', async ({ page }) => {
    await go(page, '#/find');
    const name = await page.evaluate(() => {
      const el = document.querySelector('.rjb-view-enter');
      return el ? getComputedStyle(el).animationName : null;
    });
    expect(name).toBe('none');
  });

  test('keeps the state and the toast, drops the movement', async ({ page }) => {
    const moving = () =>
      page.evaluate(() =>
        document
          .getAnimations()
          .filter((a) => a instanceof CSSAnimation && a.animationName.startsWith('rjb-'))
          .map((a) => (a as CSSAnimation).animationName),
      );
    await openJob(page);
    const star = page.getByRole('button', { name: /^Star(red)?$/ });
    const was = await star.getAttribute('aria-label');
    await press(page, star, 'Star toggle');
    await expect(star).not.toHaveAttribute('aria-label', was!);
    await expect(page.getByText(/^(Starred|Unstarred)$/)).toBeVisible();
    expect(await moving()).toEqual([]);

    // At 390, where the same Remove collapses the card with motion on (the test above).
    await page.setViewportSize({ width: 390, height: 844 });
    await go(page, '#/apply');
    const sheet = await openAllJobs(page);
    await menu(page, 'More actions: Principal Design Systems Engineer', 'Remove', sheet);
    await expect(button(sheet, 'More actions: Principal Design Systems Engineer')).toHaveCount(0);
    await expect(sheet.getByRole('button', { name: 'Undo' })).toBeVisible();
    await page.waitForTimeout(400);
    expect(await anims(page)).toEqual([]);
    expect(await moving()).toEqual([]);
  });
});
