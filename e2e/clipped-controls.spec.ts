// No clipped controls (Adrian, reported many times): no ancestor cuts a button's or another
// control's painted box, its 3px HDS hard edge included (e2e/clipped.ts). Every route, the
// account menu and its dialogs, Add job, the All jobs sheet, and Review signed in (empty and
// with postings), at 390 and 1440, light and dark. layout-rules.spec.ts runs the same probe.
import { test, expect, type Page } from './fixtures';
import { findClipped } from './clipped';
import { seed, visitAll, go, listScope } from './routes';

const THEMES = ['light', 'dark'] as const;
const WIDTHS = [390, 1440] as const;

const POSTS = [
  ['1', 'Orbit | Design Systems Engineer | Remote<p>Own our design system and design tokens.</p>'],
  ['2', 'Lumen | Design Systems Lead | Remote<p>Lead the design system and Storybook.</p>'],
  ['3', 'Kite | UX Engineer | Remote<p>Work on our design system.</p>'],
];

/** Every outside host answers: empty, or (with `posts`) a Hacker News thread of postings. */
async function feed(page: Page, posts: boolean) {
  await page.route(/^https?:\/\/(?!localhost)/, (r) => {
    const url = r.request().url();
    const json = (body: unknown) =>
      r.fulfill({
        status: 200,
        headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    if (url.startsWith('https://api.lever.co/')) return json([]);
    if (!url.startsWith('https://hn.algolia.com/') || !posts)
      return json(url.startsWith('https://hn.algolia.com/') ? { hits: [] } : { jobs: [] });
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
      hits: POSTS.map(([id, text]) => ({
        objectID: `p-${id}`,
        story_id: 9,
        parent_id: 9,
        created_at: new Date().toISOString(),
        comment_text: text,
      })),
    });
  });
}

async function check(page: Page, name: string, bad: string[]) {
  for (const line of await findClipped(page)) bad.push(`${name}: ${line}`);
}

/** The Account menu, then each dialog it opens. */
async function accountSurfaces(page: Page, bad: string[]) {
  const account = page.getByRole('button', { name: /^Account/ });
  await account.click();
  await expect(page.getByRole('menu')).toBeVisible();
  await check(page, 'account menu', bad);
  await page.keyboard.press('Escape');
  for (const item of ['Search profile', 'Data']) {
    await account.click();
    await page.getByRole('menuitem', { name: item, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: item });
    await expect(dialog).toBeVisible();
    await page.waitForTimeout(400);
    await check(page, `${item} dialog`, bad);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  }
}

for (const theme of THEMES) {
  for (const width of WIDTHS) {
    test.describe(`${theme} ${width}`, () => {
      test.use({ viewport: { width, height: width < 600 ? 844 : 900 }, colorScheme: theme });
      test.beforeEach(async ({ page }) => {
        await page.addInitScript((t) => localStorage.setItem('rjb_color_mode', t), theme);
      });

      test('no route, menu or dialog clips a control', async ({ page }) => {
        test.setTimeout(120_000);
        await seed(page);
        const bad: string[] = [];
        await visitAll(page, (name) => check(page, name, bad));
        await go(page, '#/apply');
        const list = await listScope(page);
        await check(page, 'job list', bad);
        await list.getByRole('button', { name: 'Add job' }).click();
        const add = page.getByRole('dialog', { name: 'Add a job' });
        await expect(add).toBeVisible();
        await check(page, 'Add a job dialog', bad);
        await page.keyboard.press('Escape');
        await expect(add).toBeHidden();
        if (width < 1024) await page.keyboard.press('Escape');
        await accountSurfaces(page, bad);
        expect(bad).toEqual([]);
      });

      test.describe('signed in', () => {
        test.use({ signedIn: true });

        test('Review with no postings clips no control', async ({ page }) => {
          await feed(page, false);
          await page.goto('/#/review');
          await expect(page.getByText('No postings match yet')).toBeVisible({ timeout: 30_000 });
          const bad: string[] = [];
          await check(page, 'Review empty', bad);
          expect(bad).toEqual([]);
        });

        test('Review with postings clips no control', async ({ page }) => {
          await feed(page, true);
          await page.goto('/#/review');
          await expect(page.getByText('Orbit').first()).toBeVisible({ timeout: 30_000 });
          await page.waitForTimeout(500);
          const bad: string[] = [];
          await check(page, 'Review', bad);
          await accountSurfaces(page, bad);
          expect(bad).toEqual([]);
        });
      });
    });
  }
}

// The probe itself: a raised button whose edge a clipping box cuts is reported; one with room is not.
test('the probe reports a cut button edge', async ({ page }) => {
  await page.setContent(`
    <div style="overflow:hidden;height:40px;width:200px"><button id="a" style="height:40px;box-shadow:0 3px 0 #000">Cut</button></div>
    <div style="overflow:auto;padding-bottom:3px;width:200px"><button style="height:40px;box-shadow:0 3px 0 #000">Room</button></div>`);
  expect(await findClipped(page)).toEqual(['button[Cut] bottom 3.0px by div']);
});
