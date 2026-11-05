// Accessibility of the open states and keyboard paths that `a11y.spec.ts` (closed pages only) does
// not reach: the Menu open, Calibrate's title filter (#223), the Documents editor (#227), Add a
// company (#237) and the Company page (#230). axe at 1440 and 390, light and dark, then keyboard-only
// walkthroughs of the new flows. Local only (no Actions): `npm run test:e2e`.
import { test, expect, type Page } from '@playwright/test';
import { createRequire } from 'node:module';

const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

async function seed(page: Page) {
  await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  await page.goto('/#/queue');
  await page.getByRole('button', { name: 'Try with sample data' }).click();
  // A clean first run has no messages (Adrian 2026-10-22): add the starters, as a user would.
  await go(page, '#/copy-deck');
  await page.getByRole('button', { name: 'Add starter messages' }).click();
  await expect(page.getByRole('region', { name: 'Outreach messages' })).toBeVisible();
  // The sample adds a Sample track from the first starter pack: no setup needed.
  await go(page, '#/today');
  await expect(page.getByRole('region', { name: /^Review new/ })).toBeVisible();
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

        await go(page, '#/queue');
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

        await go(page, '#/copy-deck');
        // A row expands in place (rev-3 M): axe it open, then Open goes to the editor.
        await page.getByRole('button', { name: 'Follow-up after applying' }).click();
        await page.waitForTimeout(300);
        bad.push(...(await axe(page, 'document row open')));
        await page.getByRole('button', { name: 'Open Follow-up after applying' }).click();
        await expect(page).toHaveURL(/#\/copy-deck\/./);
        await page.waitForTimeout(500);
        bad.push(...(await axe(page, 'outreach editor')));

        await go(page, '#/queue');
        await page.getByRole('button', { name: 'Add job' }).first().click();
        await expect(page.getByRole('dialog')).toBeVisible();
        bad.push(...(await axe(page, 'add job')));
        await page.keyboard.press('Escape');

        // The job page is one page (#416, a11y.spec.ts scans it): axe its Add interview dialog.
        await page.locator('a[href^="#/queue/"]').first().click();
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

test.describe('the open top tab panel is not a Tab stop (#364)', () => {
  for (const width of [390, 1440]) {
    test(`Tab from the active top tab lands on the page's first control at ${width}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await seed(page);
      await go(page, '#/queue');
      const panel = page.getByRole('tabpanel');
      await expect(panel).toHaveAttribute('tabindex', '-1');
      await page.getByRole('tab', { selected: true }).focus();
      await page.keyboard.press('Tab');
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

test.describe('keyboard only', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('Menu → Documents → back to the Pipeline, and Menu → Privacy and terms → back again', async ({
    page,
  }) => {
    await seed(page);
    await go(page, '#/queue');
    await page.getByRole('button', { name: /^Account/ }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menu')).toBeVisible();
    await arrowTo(page, 'Documents', 'ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#\/copy-deck$/);
    await expect(page.getByRole('heading', { name: 'Documents' })).toBeVisible();
    expect(await tabTo(page, 'Back to Apply')).toBe(true);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#\/queue$/);

    await page.getByRole('button', { name: /^Account/ }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menu')).toBeVisible();
    await page.keyboard.press('End');
    await arrowTo(page, 'Privacy and terms', 'ArrowUp');
    await page.keyboard.press('Enter');
    // Opened from the Pipeline, the page remembers it and its Back goes there (return paths).
    await expect(page).toHaveURL(/#\/legal\/privacy\?from=%2Fqueue$/);
    // React 19 holds a lazy page's reveal a beat (Suspense throttle): tab once it is on screen.
    await expect(page.getByRole('heading', { name: 'Privacy policy' })).toBeVisible();
    expect(await tabTo(page, 'Back to Apply')).toBe(true);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#\/queue$/);
  });

  test('job Details → Company page → Back to Apply', async ({ page }) => {
    await seed(page);
    await go(page, '#/company/larkspur-analytics');
    await expect(page.getByRole('heading', { level: 1, name: /Larkspur/ })).toBeVisible();
    expect(await tabTo(page, 'Back to Apply')).toBe(true);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#\/queue$/);
  });

  test('Search profile: focus moves into the dialog, Escape returns it to Account', async ({
    page,
  }) => {
    await seed(page);
    await go(page, '#/queue');
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
    await go(page, '#/queue');
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
      await go(page, '#/queue');
      // From lg the Jobs tab is the list beside a job (#471): a pick there moves in place, so open
      // the second row, and Back leaves the tab (return-paths.spec.ts covers it).
      const wide = width > 1000;
      const link = page.locator('a[href^="#/queue/"]:not([aria-current])').first();
      const title = wide
        ? (await link.locator('.rjb-semibold').textContent())!.trim()
        : (await link.textContent())!.trim();
      await link.focus();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/#\/queue\/./);
      await expect.poll(() => focused(page)).toBe(`H1 ${title}`);
      // The heading takes focus but is not a tab stop: no ring, nothing to press.
      const heading = page.getByRole('heading', { level: 1, name: title });
      expect(await heading.evaluate((h) => getComputedStyle(h).outlineStyle)).toBe('none');
      // The browser's Back is a page change too: it lands on the title that opened the job (#359).
      if (!wide) {
        await page.goBack();
        await expect(page).toHaveURL(/#\/queue$/);
        await expect.poll(() => focused(page)).toBe(`A ${title}`);
      }
      // A page never seen before gets its heading.
      await go(page, '#/legal/terms');
      await expect.poll(() => focused(page)).toBe('H1 Terms of use');
      // A top tab keeps focus on the tab (it is still there).
      await page.getByRole('tab', { name: 'Find' }).focus();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/#\/today$/);
      await expect.poll(() => focused(page)).toBe('BUTTON Today');
    });

    // #345: the pressed control leaves with what it changed (the empty state, the banner).
    test('Try with sample data and Clear hand focus to the Pipeline heading', async ({ page }) => {
      await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
      await page.goto('/#/queue');
      await page.getByRole('button', { name: 'Try with sample data' }).focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('status', { name: 'Sample data' })).toBeVisible();
      await page.waitForTimeout(300);
      // From lg the Jobs tab turns into the list beside the first job (#471): its title is the h1.
      if (width > 1000) await expect.poll(() => focused(page)).toMatch(/^H1 /);
      else await expect.poll(() => focused(page)).toBe('H1 Apply');
      await page.getByRole('button', { name: 'Clear sample data' }).focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('status', { name: 'Sample data' })).toHaveCount(0);
      await page.waitForTimeout(300);
      await expect.poll(() => focused(page)).toBe('H1 Apply');
    });

    test('a row that leaves the list hands focus on, and the notice is announced', async ({
      page,
    }) => {
      await seed(page);
      await go(page, '#/queue');
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
      if (width > 1000) {
        await page.getByRole('button', { name: /^Status:/ }).click();
        await page.getByRole('menuitemradio', { name: /^Saved/ }).click();
      }
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
