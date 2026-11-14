import { test, expect, type Page } from '@playwright/test';
import { accountMenuItem, PROD_URL, topTab } from './routes';

// Browse renders a window of ~100 cards (memory audit 2026-11-13, useWindowedList): with 320
// postings loaded the DOM holds at most ~120 cards, the page's height holds (spacers), scroll comes
// back exactly after Find → Apply → Find, a focused card stays mounted while scrolled far away, and
// Skip still hands focus to the next card's title. Production build, synthetic HN posts only.
const COUNT = 320;

async function feed(page: Page) {
  await page.route(/^https?:\/\/(?!localhost)/, (r) => {
    const url = r.request().url();
    const json = (body: unknown) =>
      r.fulfill({
        status: 200,
        headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    if (url.startsWith('https://remotive.com/') || url.startsWith('https://jobicy.com/'))
      return json({ jobs: [] });
    if (url.startsWith('https://api.lever.co/')) return json([]);
    if (/^https:\/\/(boards-api\.greenhouse\.io|api\.ashbyhq\.com)\//.test(url))
      return json({ jobs: [] });
    if (!url.startsWith('https://hn.algolia.com/')) return r.abort();
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
    const now = Date.now();
    return json({
      hits: Array.from({ length: COUNT }, (_, i) => ({
        objectID: `p-${i}`,
        story_id: 9,
        parent_id: 9,
        created_at: new Date(now - i * 60_000).toISOString(),
        comment_text: `Company${i} | Design Systems Engineer ${i} | Remote<p>Own our design system.${i % 3 ? '' : ' Tokens, components and docs for every team.'}</p>`,
      })),
    });
  });
}

const cards = (page: Page) =>
  page.locator('ul[aria-label="New postings"] > li:not(.rjb-window-spacer)').count();

async function loadAll(page: Page) {
  // Auto-load pages the list as its end comes near; scroll to the end until nothing is left.
  const more = page.getByRole('button', { name: /^Load more/ });
  for (let i = 0; i < 100 && (await more.count()); i++) {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(150);
  }
  await expect(more).toHaveCount(0);
}

test.use({ viewport: { width: 390, height: 844 } });

test('Browse at 390 keeps a window of cards and the page height, scroll and focus hold', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await feed(page);
  await page.goto(`${PROD_URL}/#/review`);
  await accountMenuItem(page, 'Scan now');
  const list = page.getByRole('list', { name: 'New postings' });
  await expect(list.getByRole('link', { name: /Design Systems Engineer 0\b/ })).toBeVisible({
    timeout: 60_000,
  });
  await loadAll(page);
  expect(await cards(page)).toBeLessThanOrEqual(121);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);

  // Focus a card near the top, then scroll to the end and back.
  const first = list.getByRole('link', { name: /Design Systems Engineer 1\b/ });
  await first.focus();
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < height; y += 3000) {
    await page.evaluate((to) => window.scrollTo(0, to), y);
    await page.waitForTimeout(30);
    expect(await cards(page)).toBeLessThanOrEqual(121);
  }
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(200);
  expect(await cards(page)).toBeLessThanOrEqual(121);
  await expect(list.getByRole('link', { name: /Design Systems Engineer 319\b/ })).toBeVisible();
  // The focused card was never unmounted.
  await expect(first).toBeFocused();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  await expect(first).toBeFocused();

  // Scroll comes back exactly after Review → Apply → Review.
  await page.evaluate(() => window.scrollTo(0, 18_000));
  // Wait until scrollMemory has kept this position (a busy machine can be slow to).
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const kept = new Map<string, number>(
            JSON.parse(sessionStorage.getItem('rjb_scroll') || '[]'),
          );
          return [...kept].some(([k, y]) => k.includes('review') && y === window.scrollY);
        }),
      { timeout: 10_000 },
    )
    .toBe(true);
  const at = await page.evaluate(() => window.scrollY);
  const title = await page.evaluate(() => {
    const t = [...document.querySelectorAll('ul[aria-label="New postings"] h3')].find(
      (h) => h.getBoundingClientRect().top >= 0,
    );
    const ul = document.querySelector('ul[aria-label="New postings"]')!;
    return [t?.textContent, t!.getBoundingClientRect().top - ul.getBoundingClientRect().top];
  });
  // A click from where the list is scrolled (the app bar is not sticky, and a pointer click
  // would scroll up to it first, which scrollMemory rightly keeps as Find's place).
  await topTab(page, 'Apply').evaluate((a: HTMLElement) => a.click());
  await expect(page).toHaveURL(/#\/apply/);
  // Let Apply settle (its page and focus land) before coming back.
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible();
  await page.waitForTimeout(1000);
  await topTab(page, 'Review').click();
  await expect(list).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 5000 }).toBe(at);
  await page.waitForTimeout(300);
  const back = await page.evaluate((name) => {
    const t = [...document.querySelectorAll('ul[aria-label="New postings"] h3')].find(
      (h) => h.textContent === name,
    );
    const ul = document.querySelector('ul[aria-label="New postings"]')!;
    return t!.getBoundingClientRect().top - ul.getBoundingClientRect().top;
  }, title[0]);
  // The card sits where it sat in the list (spacers hold the cards' heights). The list itself may
  // move with a status line above it, so the check is in list coordinates.
  expect(back).toBe(title[1]);

  // Skip on a card deep in the list hands focus to the next card's title.
  const card = list.getByRole('article').filter({ hasText: /Design Systems Engineer 200\b/ });
  // Wheel steps, as a person scrolls (an input ends scrollMemory's hold on the restored place).
  for (let i = 0; !(await card.count()) && i < 100; i++) {
    await page.mouse.wheel(0, 2000);
    await page.waitForTimeout(60);
  }
  await expect(card).toHaveCount(1);
  await card.scrollIntoViewIfNeeded();
  await card.getByRole('button', { name: /^Skip/ }).click();
  await expect(page.locator(':focus')).toContainText(/Design Systems Engineer 201\b/);
  expect(await cards(page)).toBeLessThanOrEqual(121);
});
