// Accessibility of the open states and keyboard paths that `a11y.spec.ts` (closed pages only) does
// not reach: the Menu open, Calibrate's title filter (#223), the Documents editor (#227), Add a
// company (#237) and the Company page (#230). axe at 1440 and 390, light and dark, then keyboard-only
// walkthroughs of the new flows. Local only (no Actions): `npm run test:e2e`.
import { test, expect, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { topTab, currentTab, pressAllJobs, listScope, allWorkModes } from './routes';

const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

async function seed(page: Page) {
  await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  await page.goto('/#/apply');
  await page.getByRole('button', { name: 'Try with sample data' }).click();
  // A clean first run has no messages (Adrian 2026-10-22): add the starters, as a user would.
  await go(page, '#/review?documents=');
  await page.getByRole('button', { name: 'Add starter messages' }).click();
  await expect(page.getByRole('region', { name: 'Messages' })).toBeVisible();
  // The sample adds a Sample track from the first starter pack: no setup needed.
  await go(page, '#/review');
  await expect(page.getByRole('region', { name: /^New postings$/ })).toBeVisible();
}

async function go(page: Page, hash: string) {
  await page.evaluate((h) => (location.hash = h), hash);
  await page.waitForTimeout(500);
}

/** Tab until a link named `name` has focus; false if it never does. */
async function tabTo(page: Page, name: string, max = 20): Promise<boolean> {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    const hit = await page.evaluate(
      (n) =>
        document.activeElement?.tagName === 'A' &&
        (document.activeElement.getAttribute('aria-label') ??
          document.activeElement.textContent?.trim()) === n,
      name,
    );
    if (hit) return true;
  }
  return false;
}

/** Arrow through the open menu until the item starting with `name` has focus. */
async function arrowTo(page: Page, name: string, key: 'ArrowDown' | 'ArrowUp') {
  for (let i = 0; i < 15; i++) {
    const at = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
    if (at.startsWith(name)) return;
    await page.keyboard.press(key);
    await page.waitForTimeout(100);
  }
  throw new Error(`never reached ${name}`);
}

async function axe(page: Page, where: string): Promise<string[]> {
  await page.addScriptTag({ path: AXE });
  const found: string[] = await page.evaluate(async () => {
    // Let every finite animation and transition end first: axe caught an HDS Alert mid-fade, its
    // half-faded text failing contrast (a flake). Loop, since one ending can start another.
    for (let i = 0; i < 10; i++) {
      const running = document
        .getAnimations()
        .filter(
          (a) => a.playState === 'running' && a.effect?.getComputedTiming().endTime !== Infinity,
        );
      if (!running.length) break;
      await Promise.all(running.map((a) => a.finished.catch(() => {})));
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await (window as any).axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return r.violations.map((v: any) => `${v.id} x${v.nodes.length}: ${v.nodes[0]?.target}`);
  });
  return found.map((v) => `${where} ${v}`);
}

for (const theme of ['light', 'dark'] as const) {
  for (const width of [1440, 390] as const) {
    test.describe(`${theme} ${width}`, () => {
      test.use({ viewport: { width, height: width > 600 ? 900 : 844 }, colorScheme: theme });

      test('open states have no axe violations', async ({ page }) => {
        test.setTimeout(120_000);
        await page.addInitScript((t) => localStorage.setItem('rjb_color_mode', t), theme);
        await seed(page);
        const bad: string[] = [];

        await go(page, '#/apply');
        await page.getByRole('button', { name: /^Account/ }).click();
        await expect(page.getByRole('menu')).toBeVisible();
        bad.push(...(await axe(page, 'menu open')));
        // Followed / Ignored companies (the Companies tab's place).
        await page.getByRole('menuitem', { name: 'Companies' }).click();
        await expect(page.getByRole('dialog', { name: 'Companies' })).toBeVisible();
        bad.push(...(await axe(page, 'companies list')));
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).toBeHidden();

        // The Search profile (#388: Calibrate's and Manage track's place), with remote only off.
        await page.getByRole('button', { name: /^Account/ }).click();
        await page.getByRole('menuitem', { name: 'Search profile' }).click();
        const profile = page.getByRole('dialog', { name: 'Search profile' });
        await expect(profile).toBeVisible();
        await profile.getByRole('switch', { name: 'Remote only' }).click();
        bad.push(...(await axe(page, 'search profile')));
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).toBeHidden();

        await go(page, '#/review?documents=');
        // A row expands in place (rev-3 M): axe it open, then Open goes to the editor.
        await page.getByRole('button', { name: 'Follow-up after applying' }).click();
        await page.waitForTimeout(300);
        bad.push(...(await axe(page, 'document row open')));
        await page.getByRole('button', { name: 'Open Follow-up after applying' }).click();
        await expect(page).toHaveURL(/documents=./);
        await page.waitForTimeout(500);
        bad.push(...(await axe(page, 'outreach editor')));

        await go(page, '#/apply');
        // Add job is the list's (#543): the column from lg, the All jobs sheet below it.
        const rail = page.getByRole('navigation', { name: 'Jobs', exact: true });
        const wide = (await rail.count()) > 0;
        const list = await listScope(page);
        await list.getByRole('button', { name: 'Add job' }).click();
        await expect(page.getByRole('dialog', { name: 'Add a job' })).toBeVisible();
        bad.push(...(await axe(page, 'add job')));
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog', { name: 'Add a job' })).toHaveCount(0);

        // Below lg the tab is one job (Proposal A): axe the All jobs sheet open.
        if (!wide) {
          await expect(page.getByRole('dialog', { name: 'All jobs' })).toBeVisible();
          await page.waitForTimeout(300);
          bad.push(...(await axe(page, 'all jobs sheet')));
          await page.keyboard.press('Escape');
          await expect(page.getByRole('dialog')).toBeHidden();
        }
        // The job page is one page (#416, a11y.spec.ts scans it): axe its Add interview dialog.
        if (await rail.count()) await rail.locator('a[href^="#/apply/"]').first().click();
        await page
          .getByRole('button', { name: /^More actions/ })
          .first()
          .click();
        await page.getByRole('menuitem', { name: 'Add interview…' }).click();
        await expect(page.getByRole('dialog', { name: 'Add interview' })).toBeVisible();
        await page.waitForTimeout(300);
        bad.push(...(await axe(page, 'add interview')));
        await page.keyboard.press('Escape');

        expect(bad).toEqual([]);
      });
    });
  }
}

test.describe('Tab from the open top tab goes on into the page (#364)', () => {
  for (const width of [390, 1440]) {
    test(`Tab from the active top tab lands on the page's first control at ${width}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await seed(page);
      await go(page, '#/apply');
      // Links in a nav (top tabs PR): no tab panel; the next stop is the page's first control.
      await expect(page.getByRole('tabpanel')).toHaveCount(0);
      const panel = page.getByRole('main');
      await currentTab(page).focus();
      // The tabs are the page bar's, in main (2026-11-12); Tab on past any header stop.
      for (let i = 0; i < 3; i++) {
        await page.keyboard.press('Tab');
        if (!(await page.evaluate(() => !!document.activeElement?.closest('header')))) break;
      }
      const landed = await panel.evaluate(
        (p) =>
          document.activeElement !== p &&
          !!document.activeElement &&
          p.contains(document.activeElement),
      );
      expect(landed).toBe(true);
    });
  }
});

// Retro quick wins (2026-11-08): a ring shows for the keyboard only (:focus-visible), never after a
// tap or click on a button, tab or radio.
test('a click or tap leaves no focus ring', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(page);
  // The pager shows only beside postings (2026-11-13): a synthetic Hacker News feed (no
  // real people), as review.spec does, so Find lists some. Registered after seed's abort-all, so
  // it wins for hn.algolia.com.
  await page.route(/^https:\/\/hn\.algolia\.com\//, (r) =>
    r.fulfill({
      status: 200,
      headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
      body: JSON.stringify(
        r.request().url().includes('search_by_date')
          ? {
              hits: [
                {
                  objectID: '9',
                  title: 'Ask HN: Who is hiring? (October 2026)',
                  created_at: '2026-10-01',
                },
              ],
            }
          : {
              hits: [
                ['1', 'Orbit | Design Systems Engineer | Remote<p>Own our design system.</p>'],
                ['2', 'Lumen | Design Systems Lead | Remote<p>Lead the design system.</p>'],
              ].map(([id, text]) => ({
                objectID: `p-${id}`,
                story_id: 9,
                parent_id: 9,
                created_at: new Date().toISOString(),
                comment_text: text,
              })),
            },
      ),
    }),
  );
  await page.reload();
  await expect(page.getByRole('button', { name: 'Next posting' })).toBeVisible({ timeout: 15_000 });
  const ring = () =>
    page.evaluate(() => {
      const e = document.activeElement as HTMLElement | null;
      if (!e || e === document.body) return 'none';
      const cs = getComputedStyle(e);
      const shadow =
        cs.boxShadow !== 'none' && !/^(rgba\(0, 0, 0, 0\)[^,]*,?\s*)+$/.test(cs.boxShadow);
      // A pressed toggle (2026-11-09) is the secondary button, whose edge is a
      // box shadow at rest too: only a shadow that differs from the unfocused one is a ring.
      const rest = e.getAttribute('aria-pressed') === 'true';
      return cs.outlineStyle !== 'none' || (shadow && !rest)
        ? `${e.tagName} ${e.textContent?.trim()}`
        : 'none';
    });
  // The top tabs' names end in their count when they show one ("Apply 12", #548).
  for (const [role, name] of [
    // The phone pager's Next posting (2026-11-13): focus stays on the pager, no ring after a click.
    ['button', 'Next posting'],
    ['link', 'Apply'],
    ['link', 'Review'],
    // Scan now is in the Account menu (#694): a menu moves focus into itself, so it is not in
    // this list.
  ] as const) {
    const target =
      role === 'link'
        ? topTab(page, String(name))
        : page.getByRole(role, { name, exact: true }).first();
    await target.click();
    await page.waitForTimeout(200);
    expect(await ring(), `${role} ${name}`).toBe('none');
  }
});

test.describe('keyboard only', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('Menu → Documents → Escape back on Apply, and Menu → Privacy and terms → Escape again', async ({
    page,
  }) => {
    await seed(page);
    await go(page, '#/apply');
    await page.getByRole('button', { name: /^Account/ }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menu')).toBeVisible();
    await arrowTo(page, 'Documents', 'ArrowDown');
    await page.keyboard.press('Enter');
    // A dialog over the page it was asked from (#471 slice 4); Escape closes it there.
    await expect(page).toHaveURL(/#\/apply\?documents=$/);
    const docs = page.getByRole('dialog', { name: 'Documents' });
    await expect(docs).toBeVisible();
    expect(await docs.evaluate((d) => d.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(docs).toBeHidden();
    await expect(page).toHaveURL(/#\/apply$/);
    await expect.poll(() => focused(page)).toMatch(/^BUTTON Account/);

    await page.getByRole('button', { name: /^Account/ }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menu')).toBeVisible();
    await page.keyboard.press('End');
    await arrowTo(page, 'Privacy and terms', 'ArrowUp');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#\/apply\?legal=privacy$/);
    const legal = page.getByRole('dialog', { name: 'Privacy and terms' });
    await expect(legal.getByRole('tab', { name: 'Privacy policy', selected: true })).toBeVisible();
    // It opens on Close, not on the first tab or link in the text (retro quick wins).
    await expect.poll(() => focused(page)).toBe('BUTTON Close');
    // The tabs swap in place with the arrow keys.
    await legal.getByRole('tab', { name: 'Privacy policy' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page).toHaveURL(/#\/apply\?legal=terms$/);
    await page.keyboard.press('Escape');
    await expect(legal).toBeHidden();
    await expect(page).toHaveURL(/#\/apply$/);
  });

  test('job Details → Company page → Back to Apply', async ({ page }) => {
    await seed(page);
    await go(page, '#/apply/company/larkspur-analytics');
    await expect(page.getByRole('heading', { level: 1, name: /Larkspur/ })).toBeVisible();
    // At lg the Apply list comes first, beside the Company (#471 slice 2), so the walk is longer.
    expect(await tabTo(page, 'Back to Apply', 80)).toBe(true);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#\/apply$/);
  });

  test('Search profile: focus moves into the dialog, Escape returns it to Account', async ({
    page,
  }) => {
    await seed(page);
    await go(page, '#/apply');
    const account = page.getByRole('button', { name: /^Account/ });
    await account.click();
    await page.getByRole('menuitem', { name: 'Search profile' }).click();
    const dialog = page.getByRole('dialog', { name: 'Search profile' });
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(account).toBeFocused();
  });

  test('Add job: Escape returns focus to the button that opened it', async ({ page }) => {
    await seed(page);
    await go(page, '#/apply');
    const add = page.getByRole('button', { name: 'Add job' }).first();
    await add.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(add).toBeFocused();
  });
});

/** What has focus: `BODY` when nothing does (focus was dropped), else the element's tag and name. */
const focused = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body || !el.isConnected) return 'BODY';
    return `${el.tagName} ${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim()}`;
  });

// Focus is never dropped to the page (2026-10-27 audit): a page change moves it to the new page's
// heading, so a screen reader names the page and Tab goes on from the top of it; a row that leaves
// a list (Mark applied, Remove) hands it to the row that took its place.
for (const width of [390, 1440] as const) {
  test.describe(`focus is never dropped ${width}`, () => {
    test.use({ viewport: { width, height: width > 600 ? 900 : 844 } });

    test('a page change moves focus to the new page heading', async ({ page }) => {
      await seed(page);
      await allWorkModes(page);
      await go(page, '#/apply');
      // From lg the Jobs tab is the list beside a job (#471): a pick there moves in place, so open
      // the second row. Below lg the list is the All jobs sheet (Proposal A): a pick closes it.
      const wide = width > 1000;
      if (!wide) await pressAllJobs(page);
      // One job list in both (#543): the rows' links hold the title alone.
      const scope = page.getByRole('navigation', { name: 'Jobs' });
      const link = scope.locator('a[href^="#/apply/"]:not([aria-current])').nth(wide ? 0 : 1);
      const title = (await link.textContent())!.trim();
      await link.focus();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/#\/apply\/./);
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect.poll(() => focused(page)).toBe(`H1 ${title}`);
      // The heading takes focus but is not a tab stop: no ring, nothing to press.
      const heading = page.getByRole('heading', { level: 1, name: title });
      expect(await heading.evaluate((h) => getComputedStyle(h).outlineStyle)).toBe('none');
      // A page never seen before gets its heading.
      await go(page, '#/legal/terms');
      // Legal is a dialog now (#471 slice 4): focus goes into it.
      await expect(page.getByRole('dialog', { name: 'Privacy and terms' })).toBeVisible();
      await expect
        .poll(() => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')))
        .toBe(true);
      // Opened by a link, it has no opener: closing hands focus to the page's heading.
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect.poll(() => focused(page)).toBe('H1 Review');
      // A top tab keeps focus on the tab (it is still there).
      await topTab(page, 'Review').focus();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/#\/review$/);
      await expect.poll(() => focused(page)).toBe('A Review');
    });

    // #345: the pressed control leaves with what it changed (the empty state, the banner).
    test('Try with sample data hands focus to the page heading; Clear (Account menu) keeps it off body', async ({
      page,
    }) => {
      await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
      await page.goto('/#/apply');
      await page.getByRole('button', { name: 'Try with sample data' }).focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('button', { name: 'Try with sample data' })).toHaveCount(0);
      await page.waitForTimeout(300);
      // The Apply tab turns into the first job (#471, Proposal A): its title is the h1.
      await expect.poll(() => focused(page)).toMatch(/^H1 /);
      // Clear sample data is the Account menu's since 2026-11-13 (shown only while sample jobs exist).
      await page.getByRole('button', { name: /^Account/ }).click();
      await page.getByRole('menuitem', { name: 'Clear sample data' }).focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('button', { name: 'Try with sample data' })).toBeVisible();
      await page.waitForTimeout(300);
      await expect.poll(() => focused(page)).not.toMatch(/^BODY/);
      await page.getByRole('button', { name: /^Account/ }).click();
      await expect(page.getByRole('menuitem', { name: 'Clear sample data' })).toHaveCount(0);
      await page.keyboard.press('Escape');
    });

    test('a row that leaves the list hands focus on, and the notice is announced', async ({
      page,
    }) => {
      await seed(page);
      await go(page, '#/apply');
      // Record what live regions say: Radix's announcer is only on the page for a second.
      await page.evaluate(() => {
        const said: string[] = ((window as unknown as { said: string[] }).said = []);
        new MutationObserver(() => {
          document
            .querySelectorAll('[aria-live="polite"], [aria-live="assertive"], [role="status"]')
            .forEach((r) => {
              if (r.closest('[aria-hidden="true"]') || r.getAttribute('aria-live') === 'off')
                return;
              said.push(`${r.getAttribute('aria-live')}|${r.textContent ?? ''}`);
            });
        }).observe(document.body, { childList: true, subtree: true, characterData: true });
      });
      // From lg the Jobs tab is the list beside one job (#471): show a saved one, to apply to.
      if (width > 1000) await page.getByRole('button', { name: /^To apply \d/ }).click();
      const mark = page.getByRole('button', { name: /^Mark applied/ }).first();
      await mark.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByText(/^Marked applied/).first()).toBeVisible();
      await page.waitForTimeout(800);
      expect(await focused(page)).not.toBe('BODY');
      expect(
        await page.evaluate(() => document.querySelector('main')!.contains(document.activeElement)),
      ).toBe(true);
      // The toast's text reaches a live region politely, the title and the job's name apart (#365:
      // Radix's assertive announcer ran them together, "…7 daysDesign Engineer").
      const said = await page.evaluate(() => (window as unknown as { said: string[] }).said);
      const notice = said.filter((t) => t.includes('Marked applied'));
      expect(notice.length).toBeGreaterThan(0);
      expect(notice.every((t) => t.startsWith('polite|'))).toBe(true);
      expect(notice.some((t) => /Marked applied[^|]*\. \S/.test(t))).toBe(true);
    });
  });
}
