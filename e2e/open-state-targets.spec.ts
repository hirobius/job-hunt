// 44px targets in the open states and on links that are a row's whole value (rules audit
// 2026-11-18). a11y.spec.ts's phone sweep reads the closed routes, and of the links only the
// button-shaped ones, so two things got past it: the Search profile chips' Remove keys (40x40) and
// a job's Details links (one text line, 19px, high). This sweep opens the Account menu, each of its
// dialogs, the view picker and a job's More menu at 390, light and dark, and probes the target
// itself (`elementFromPoint`), so an overhang that takes the tap counts and one that is covered
// does not. A link inside a sentence is exempt (WCAG 2.5.8, inline).
// Local only: `npm run test:e2e`.
import { test, expect, type Page } from './fixtures';
import { seed, go } from './routes';

/** One line per control in the top open layer (or the page) whose target is under 44px. */
function small(page: Page) {
  return page.evaluate(() => {
    const MIN = 43.5;
    const out: string[] = [];
    const shown = (el: Element) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 1 && r.height > 1 && cs.visibility !== 'hidden' && cs.display !== 'none';
    };
    const layers = [...document.querySelectorAll('[role=dialog],[role=alertdialog],[role=menu]')];
    const root = layers.filter(shown).pop() ?? document.querySelector('main')!;
    const controls = root.querySelectorAll<HTMLElement>(
      'button, a[href], [role=tab], [role=menuitem], [role=menuitemradio], [role=menuitemcheckbox], [role=switch], [role=checkbox], [role=radio], select, input:not([type=hidden])',
    );
    for (const el of controls) {
      if (!shown(el) || (el as HTMLButtonElement).disabled || el.closest('[aria-hidden=true]'))
        continue;
      // HDS's own clear-input button is 30px wide (hds#750).
      if (el.getAttribute('aria-label') === 'Clear input') continue;
      // A link in a sentence: text beside it in the same parent.
      const inSentence =
        el.tagName === 'A' &&
        getComputedStyle(el).display === 'inline' &&
        [...el.parentElement!.childNodes].some(
          (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim().length > 1,
        );
      if (inSentence) continue;
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      if (r.top < 0 || r.bottom > innerHeight) continue;
      const takes = (dx: number, dy: number) => {
        const hit = document.elementFromPoint(r.x + r.width / 2 + dx, r.y + r.height / 2 + dy);
        return (
          !!hit && (hit === el || el.contains(hit) || (hit.matches('label') && hit.contains(el)))
        );
      };
      const half = MIN / 2 - 1;
      const tall = r.height >= MIN || (takes(0, -half) && takes(0, half));
      const wide = r.width >= MIN || (takes(-half, 0) && takes(half, 0));
      if (!tall || !wide) {
        const name = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30);
        out.push(
          `${el.tagName.toLowerCase()}[${name}] ${Math.round(r.width)}x${Math.round(r.height)}`,
        );
      }
    }
    return [...new Set(out)];
  });
}

/** One line per pair of controls whose boxes lie over each other (Adrian 2026-11-18: a card's
 *  Show less and Read the full posting were stacked with their 44px boxes 10px into each other, and
 *  the lower one 4px into the Save row). Size alone does not show that. A control inside another
 *  (a key in a row that is itself a link) and a card's stretched title link are not a pair. */
function overlapping(page: Page) {
  return page.evaluate(() => {
    const shown = (el: Element) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 1 && r.height > 1 && cs.visibility !== 'hidden' && cs.display !== 'none';
    };
    const layers = [...document.querySelectorAll('[role=dialog],[role=alertdialog],[role=menu]')];
    const root = layers.filter(shown).pop() ?? document.querySelector('main')!;
    const controls = [
      ...root.querySelectorAll<HTMLElement>(
        'button, a[href], [role=tab], [role^=menuitem], [role=switch], [role=checkbox], select, input:not([type=hidden])',
      ),
    ].filter((el) => shown(el) && !el.closest('[aria-hidden=true]'));
    const name = (el: Element) =>
      (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 24);
    /** The part of a control's box that shows: a row scrolled under a pinned header is cut by its
     *  scroll box, and does not lie over the header's Close. */
    const seen = (el: Element) => {
      const r = el.getBoundingClientRect();
      const box = { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.overflowY === 'visible' && cs.overflowX === 'visible') continue;
        const c = n.getBoundingClientRect();
        if (cs.overflowY !== 'visible') {
          box.top = Math.max(box.top, c.top);
          box.bottom = Math.min(box.bottom, c.bottom);
        }
        if (cs.overflowX !== 'visible') {
          box.left = Math.max(box.left, c.left);
          box.right = Math.min(box.right, c.right);
        }
      }
      return box;
    };
    const out: string[] = [];
    for (let i = 0; i < controls.length; i++)
      for (let j = i + 1; j < controls.length; j++) {
        const [a, b] = [controls[i], controls[j]];
        if (a.contains(b) || b.contains(a)) continue;
        const [ra, rb] = [seen(a), seen(b)];
        const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
        const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
        // A pixel of rounding is not an overlap.
        if (w > 1.5 && h > 1.5)
          out.push(`"${name(a)}" and "${name(b)}" overlap ${Math.round(w)}x${Math.round(h)}`);
      }
    return out;
  });
}

for (const theme of ['light', 'dark'] as const)
  test.describe(`44px targets in the open states, ${theme} 390`, () => {
    test.use({ viewport: { width: 390, height: 844 }, colorScheme: theme });

    test('the Account menu, its dialogs, the view picker, a job and its More menu', async ({
      page,
    }) => {
      test.setTimeout(120_000);
      await page.addInitScript((t) => localStorage.setItem('rjb_color_mode', t), theme);
      await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
      await seed(page);
      await go(page, '#/apply');
      const bad: string[] = [];
      const read = async (where: string) => {
        await page.waitForTimeout(300);
        bad.push(...(await small(page)).map((s) => `${where}: ${s}`));
        bad.push(...(await overlapping(page)).map((s) => `${where}: ${s}`));
      };
      const account = page.getByRole('button', { name: /^Account/ });

      // The job page: its Details links are each a row's whole value.
      await expect(page.locator('main a.hds-link-standalone').first()).toBeVisible();
      await read('job page');

      await account.click();
      await expect(page.getByRole('menu')).toBeVisible();
      await read('Account menu');
      await page.keyboard.press('Escape');

      for (const item of ['Companies', 'Search profile', 'Data']) {
        await account.click();
        await page.getByRole('menuitem', { name: new RegExp(`^${item}`) }).click();
        await expect(page.getByRole('dialog', { name: item })).toBeVisible();
        await read(item);
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).toHaveCount(0);
      }

      await page.getByRole('button', { name: /^View: / }).click();
      await expect(page.getByRole('menu')).toBeVisible();
      await read('view picker');
      await page.keyboard.press('Escape');

      await page
        .getByRole('button', { name: /^More actions/ })
        .first()
        .click();
      await expect(page.getByRole('menu')).toBeVisible();
      await read('More menu');
      await page.keyboard.press('Escape');

      expect(bad).toEqual([]);
    });
  });

// A Review card with its description open (signed in: Review reads postings only then).
for (const theme of ['light', 'dark'] as const)
  test.describe(`a Review card's open description, ${theme} 390`, () => {
    test.use({
      viewport: { width: 390, height: 844 },
      colorScheme: theme,
      signedIn: true,
    });

    test('Show less, Read the full posting and the action row: 44px each, none over another', async ({
      page,
    }) => {
      await page.addInitScript((t) => localStorage.setItem('rjb_color_mode', t), theme);
      const long = 'We build the library with the product teams. '.repeat(12);
      await page.route(/^https?:\/\/(?!localhost)/, (r) => {
        const url = r.request().url();
        const json = (body: unknown) =>
          r.fulfill({
            status: 200,
            headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
            body: JSON.stringify(body),
          });
        if (url.startsWith('https://api.lever.co/')) return json([]);
        if (!url.startsWith('https://hn.algolia.com/')) return json({ jobs: [] });
        if (url.includes('search_by_date'))
          return json({
            hits: [
              {
                objectID: '9',
                title: 'Ask HN: Who is hiring? (October 2026)',
                created_at: '2026-10-01',
              },
            ],
          });
        return json({
          hits: [
            {
              objectID: 'p-1',
              story_id: 9,
              parent_id: 9,
              created_at: new Date().toISOString(),
              comment_text: `Orbit | Design Systems Engineer | Remote<p>Own our design system. ${long}</p>`,
            },
          ],
        });
      });
      await page.goto('/#/review');
      const card = page.locator('main article').first();
      await card.getByRole('button', { name: 'Show more' }).click();
      await expect(card.getByRole('link', { name: /^Read the full posting/ })).toBeVisible();
      await page.waitForTimeout(300);
      expect([...(await small(page)), ...(await overlapping(page))]).toEqual([]);
    });
  });
