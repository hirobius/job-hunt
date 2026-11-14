// Redesign §5.11 (#553, #554): empty, error and done states sit on the page background (no card
// around them), with one filled key and one grey key; when To apply is finished, the Apply tab shows
// the empty-state icon tile, "That is the list", the week, the next step and All jobs. 390 and 1440.
import { test, expect, type Locator, type Page } from '@playwright/test';

const CARD = '[data-padding][data-variant]';

async function noOutsideHosts(page: Page) {
  await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
}

/** Not inside an HDS Card (#553: on the page background). */
async function onPage(state: Locator) {
  expect(await state.evaluate((el, card) => !!el.closest(card), CARD)).toBe(false);
}

const variantOf = (b: Locator) => b.getAttribute('data-variant');

for (const width of [390, 1440]) {
  test.describe(`at ${width}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await noOutsideHosts(page);
    });

    test('Apply empty: Track your first job on the page, Add job filled, sample data grey', async ({
      page,
    }) => {
      await page.goto('/#/apply');
      const title = page.getByText('Track your first job');
      await expect(title).toBeVisible();
      await onPage(title);
      const main = page.getByRole('main');
      expect(await variantOf(main.getByRole('button', { name: 'Add job' }).first())).toBe(
        'primary',
      );
      expect(await variantOf(main.getByRole('button', { name: 'Try with sample data' }))).toBe(
        'secondary',
      );
    });

    test('done: the icon tile, the week and two keys, then All jobs opens the list', async ({
      page,
    }) => {
      for (const n of [1, 2]) {
        await page.goto(
          '/?applied=' + encodeURIComponent(`https://acme.example/jobs/${n}`) + `&t=Designer+${n}`,
        );
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      }
      await page.goto('/#/apply');
      const done = page.getByRole('region', { name: 'That is the list' });
      await expect(done).toBeVisible();
      await onPage(done);
      await expect(page.getByRole('heading', { level: 1, name: 'Apply' })).toBeVisible();
      await expect(done.locator('[aria-hidden="true"] svg')).toBeVisible();
      await expect(done.locator('.rjb-flame')).toHaveCount(0);
      await expect(done.getByText('You applied to 2 jobs this week.')).toBeVisible();
      const next = done.getByRole('button', { name: 'Find more jobs' });
      const all = done.getByRole('button', { name: 'All jobs' });
      expect(await variantOf(next)).toBe('primary');
      expect(await variantOf(all)).toBe('secondary');
      for (const key of [next, all]) {
        const box = await key.boundingBox();
        if (width === 390) expect(box!.height).toBeGreaterThanOrEqual(44);
      }
      await all.click();
      await expect(done).toBeHidden();
      await expect(page.getByRole('heading', { level: 1, name: /^Designer / })).toBeFocused();
    });
  });
}

test('Find with no results: Scan now filled, Edit search profile grey, on the page', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // Every source answers, with nothing in it.
  await page.route(/^https?:\/\/(?!localhost)/, (r) => {
    const url = r.request().url();
    const body = url.startsWith('https://api.lever.co/')
      ? []
      : url.startsWith('https://hn.algolia.com/')
        ? { hits: [] }
        : { jobs: [] };
    return r.fulfill({
      status: 200,
      headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  });
  await page.goto('/#/review');
  const title = page.getByText('No postings match yet');
  await expect(title).toBeVisible({ timeout: 30_000 });
  await onPage(title);
  // One Scan now: the heading's steps aside while the empty state shows its own.
  const scan = page.getByRole('button', { name: 'Scan now' });
  await expect(scan).toHaveCount(1);
  expect(await variantOf(scan)).toBe('primary');
  const edit = page.getByRole('button', { name: 'Edit search profile' });
  expect(await variantOf(edit)).toBe('secondary');
  await edit.click();
  await expect(page.getByRole('dialog', { name: /Search profile/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(edit).toBeFocused();
});
