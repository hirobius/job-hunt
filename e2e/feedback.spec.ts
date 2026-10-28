import { test, expect, type Locator, type Page } from '@playwright/test';
import { go, openJob, seed } from './routes';

// The feedback sweep (#212): every row and page action on the Pipeline, the job page, Documents
// and Companies must change something visible within 300 ms of the press: the page's text (a
// toast, a dialog, a new state), the route, or a new keyframe animation on an element with a box (a
// flash, a pop, a collapse). A press that only changes an aria-label or a colour transition does
// not count. Neither does something going away on its own: picking an item closes its menu whatever
// the item did, and an earlier toast may leave during the press. So open menus, listboxes and
// toasts are left out of the page's text; one that appears, or whose text changes, still counts.
// Every Remove (a Pipeline job, a to-do, an interview, a final copy, a document, an outreach
// target, a track's link or section) collapses its row and offers Undo.
test.use({
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

const button = (page: Page, name: string | RegExp) =>
  page.getByRole('button', { name, exact: typeof name === 'string' }).first();
const item = (page: Page, name: string) =>
  page
    .getByRole('menuitem', { name, exact: true })
    .or(page.getByRole('menuitemradio', { name, exact: true }));

/** Open a row's menu (itself an action) and pick an item. */
async function menu(page: Page, trigger: string, choice: string) {
  await press(page, button(page, trigger), trigger);
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

test('Pipeline: every row and page action answers within 300 ms', async ({ page }) => {
  await go(page, '#/queue');
  await press(page, button(page, 'Mark applied: Solutions Engineer'), 'Mark applied');
  await expect(
    page.getByText('Marked applied · Follow up in 7 days', { exact: true }),
  ).toBeVisible();

  // The job's card flashes and collapses (cards at every width, Adrian 2026-10-24); the toast
  // alone is not the item's feedback.
  await menu(page, 'More actions: Senior Product Designer', 'Star');
  await ranIn(page, 'rjb-flash', 'Senior Product Designer');
  await menu(page, 'More actions: Senior Product Designer', 'Unstar');
  await ranIn(page, 'rjb-flash', 'Senior Product Designer');
  await menu(page, 'More actions: Implementation Consultant', 'Retire');
  await menu(page, 'More actions: Product Designer', 'Interviewing');
  await ranIn(page, 'rjb-flash', 'Product Designer');
  await menu(page, 'More actions: Clinical Systems Analyst', 'Remove');
  await ranIn(page, 'rjb-collapse', 'Clinical Systems Analyst');
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
  await expect(button(page, 'More actions: Clinical Systems Analyst')).toHaveCount(0);

  for (const name of ['Status: Active', 'Sort: Newest']) {
    await press(page, button(page, name), name);
    await closeOverlay(page);
  }
  for (const name of ['Add job', 'Follow up: UX Researcher', 'Export links', 'Clear sample data']) {
    await press(page, button(page, name), name);
    await closeOverlay(page);
  }
  await press(page, button(page, 'Check which are still open'), 'Check which are still open');
  await press(page, button(page, 'Dismiss'), 'Dismiss getting started');
  await press(page, button(page, 'Start applying'), 'Start applying');
  await go(page, '#/queue');
  await press(page, button(page, 'Find the next company'), 'Find the next company');
});

test('Pipeline cards (390): Remove collapses the card before it goes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await go(page, '#/queue');
  await menu(page, 'More actions: Clinical Systems Analyst', 'Remove');
  await ranIn(page, 'rjb-collapse', 'Clinical Systems Analyst');
  await expect(button(page, 'More actions: Clinical Systems Analyst')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
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
  await press(page, button(page, 'Add starter tasks'), 'Add starter tasks');
  // Delete on a to-do collapses its row, then offers Undo.
  const todo = 'Research company / role';
  await press(page, button(page, `Delete “${todo}”`), 'Delete a to-do');
  await ranIn(page, 'rjb-collapse', todo);
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
  await expect(button(page, `Delete “${todo}”`)).toHaveCount(0);
  await press(page, button(page, 'Add a to-do'), 'Add a to-do');
  await closeOverlay(page);
  const followUp = (await page
    .getByRole('button', { name: /^Follow up: / })
    .first()
    .getAttribute('aria-label'))!;
  for (const name of [followUp, 'Use template']) {
    await press(page, button(page, name), name);
    await closeOverlay(page);
  }
  await press(
    page,
    page.getByRole('button', { name: /^(All documents|Add a document)/ }),
    'Documents row',
  );
  await page.getByRole('button', { name: /^(All documents|Add a document)/ }).click();
  for (const tab of ['Screening', 'Interviews', 'Overview'])
    await press(page, page.getByRole('tab', { name: tab }), `${tab} tab`);

  // Remove on a booked interview collapses its row, then offers Undo.
  await page.getByRole('tab', { name: 'Interviews' }).click();
  const log = page.getByRole('tabpanel');
  await log.getByLabel('Event date').fill('2030-01-08');
  await log.getByRole('button', { name: 'Add interview' }).click();
  const removeInterview = log.getByRole('button', { name: /^Remove interview on / });
  await press(page, removeInterview, 'Remove an interview');
  await ranIn(page, 'rjb-collapse', 'Interview');
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
  await expect(removeInterview).toHaveCount(0);
  await page.getByRole('tab', { name: 'Overview' }).click();

  // Remove on a final copy collapses its row, then offers Undo, which brings the file back.
  await page.getByRole('button', { name: /^(All documents|Add a document)/ }).click();
  await page.getByRole('button', { name: 'Upload a final copy' }).click();
  await page.getByLabel('Choose a file to upload').setInputFiles({
    name: 'final-cover.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 final copy'),
  });
  await page.getByRole('button', { name: 'Upload', exact: true }).click();
  const removeCopy = button(page, 'Remove final-cover.pdf');
  await press(page, removeCopy, 'Remove a final copy');
  await ranIn(page, 'rjb-collapse', 'final-cover.pdf');
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(removeCopy).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(button(page, 'Download final-cover.pdf')).toBeVisible();

  await menu(page, more, 'Remove');
  await expect(page).toHaveURL(/#\/queue$/);
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
});

test('Documents: Pin, Duplicate, Copy and Delete answer within 300 ms', async ({ page }) => {
  await go(page, '#/copy-deck');
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
    await go(page, '#/copy-deck');
    await press(page, button(page, name), name);
  }

  // The editor: its menus, the variables panel and Save.
  await go(page, '#/copy-deck/tpl-outreach');
  for (const name of ['Insert variable', 'More actions', /^Version history/]) {
    await press(page, button(page, name), String(name));
    await closeOverlay(page);
  }
  await press(page, page.getByRole('combobox', { name: /^Fill for: / }), 'Fill for');
  await closeOverlay(page);
  await press(page, button(page, 'Copy filled text'), 'Copy filled text');
  await press(page, button(page, 'Company'), 'Variable chip');
  await page.getByRole('textbox').first().press('End');
  await page.keyboard.type(' more');
  await press(page, button(page, 'Save'), 'Save');
});

test('Companies: star, roles and the page actions answer within 300 ms', async ({ page }) => {
  await go(page, '#/discover/teams');
  const star = page.getByRole('button', { name: 'Star Ensono as a dream company' }).first();
  await press(page, star, 'Dream star');
  await expect(star.locator('svg')).toHaveClass(/rjb-pop/);
  // Unstarring is a soft Remove (#324): the notice offers Undo, and Undo puts the star back.
  await press(page, star, 'Dream unstar');
  await expect(page.getByText('Removed “Ensono”', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(star).toHaveAttribute('aria-pressed', 'true');
  // The Companies row stays in its list, so it must not collapse (it would stay invisible).
  await expect(star.locator('xpath=ancestor::li[1]')).not.toHaveAttribute(
    'data-motion',
    'collapse',
  );
  await press(page, button(page, 'Roles at Okta'), 'Roles');
  for (const name of ['Add a company', /^Change where/, 'Manage track', 'New track']) {
    await press(page, button(page, name), String(name));
    await closeOverlay(page);
  }

  // Manage track: Remove on a link and Delete on a section collapse their rows; the dialog offers
  // Undo, which puts them back.
  await button(page, 'Manage track').click();
  const dialog = page.getByRole('dialog', { name: 'Manage track' });
  const links = dialog.getByRole('list', { name: /^Links in / }).first();
  const removeLink = links.getByRole('button', { name: /^Remove / }).first();
  const link = (await removeLink.getAttribute('aria-label'))!.replace(/^Remove /, '');
  await press(page, removeLink, 'Remove a link');
  await ranIn(page, 'rjb-collapse', link);
  await expect(links.getByRole('button', { name: `Remove ${link}`, exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Undo' }).click();
  await expect(links.getByRole('button', { name: `Remove ${link}`, exact: true })).toHaveCount(1);
  const sections = dialog.getByRole('textbox', { name: 'Section name' });
  const count = await sections.count();
  await press(
    page,
    dialog
      .getByRole('listitem')
      .filter({ has: page.getByRole('list', { name: /^Links in / }) })
      .first()
      .getByRole('button', { name: /^Delete .* section$/ }),
    'Delete a section',
  );
  await ranIn(page, 'rjb-collapse', link);
  await expect(sections).toHaveCount(count - 1);
  await dialog.getByRole('button', { name: 'Undo' }).click();
  await expect(sections).toHaveCount(count);
  await closeOverlay(page);

  // The tools, the list's filter and Suggest companies.
  await go(page, '#/discover/teams');
  for (const name of ['All', 'Hiring now', 'Suggest companies'])
    await press(page, button(page, name), name);
  for (const name of ['Apply now', 'ATS search', 'Watched'])
    await press(page, page.getByRole('radio', { name }).or(button(page, name)).first(), name);

  // Apply now: a tile's Save and Set aside.
  await go(page, '#/discover/apply');
  await press(page, button(page, 'Set aside'), 'Set aside');
  await press(page, button(page, 'Save'), 'Save a tile');

  // ATS search: Copy the query says so in a toast; the chips, menus and disclosures answer.
  await go(page, '#/discover/ats');
  await press(page, button(page, 'Copy the query'), 'Copy the query');
  await expect(page.getByText('Copied the query', { exact: true })).toBeVisible();
  for (const name of [/^Recency: /, /^Engagement: /]) {
    await press(page, page.getByRole('combobox', { name }), String(name));
    await closeOverlay(page);
  }
  for (const name of [
    'Implementation Specialist',
    'Show full query',
    /^Show \d+ more$/,
    /^Big job boards/,
  ])
    await press(page, button(page, name), String(name));

  // Live postings: Calibrate, Refine, Search and Retry.
  await go(page, '#/discover/live');
  for (const name of [/^Calibrate/, /^Refine/, 'Search', 'Retry'])
    await press(page, button(page, name), String(name));

  // The Design Systems pack brings outreach targets: Remove on one collapses its row, then offers
  // Undo.
  await menu(page, 'New track', 'Design Systems');
  await go(page, '#/discover/teams');
  const targets = page.getByRole('list', { name: 'Saved targets' });
  const remove = targets.getByRole('button', { name: /^Remove / }).first();
  const company = (await remove.getAttribute('aria-label'))!.replace(/^Remove /, '');
  await press(page, remove, 'Remove an outreach target');
  await ranIn(page, 'rjb-collapse', company);
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
  await expect(targets.getByRole('button', { name: `Remove ${company}`, exact: true })).toHaveCount(
    0,
  );
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

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
    await go(page, '#/queue');
    await menu(page, 'More actions: Clinical Systems Analyst', 'Remove');
    await expect(button(page, 'More actions: Clinical Systems Analyst')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
    await page.waitForTimeout(400);
    expect(await anims(page)).toEqual([]);
    expect(await moving()).toEqual([]);
  });
});
