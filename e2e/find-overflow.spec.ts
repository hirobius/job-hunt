import { test, expect, type Page } from '@playwright/test';
import { accountMenuItem, PROD_URL } from './routes';

// Find at 390 never scrolls sideways (Adrian 2026-11-12): with a posting whose title is one long
// unbroken run and whose place is a long list, the page is no wider than the screen and no card is
// wider than the viewport. Production build (PROD_URL), synthetic Hacker News posts only.
const LONG_TITLE =
  'UX Designer – Prime Design Systems Platform Foundations Component Library Tokens Infrastructure';
const UNBROKEN = 'Design_Systems_Engineer_Platform_Foundations_Tokens_Components_Infrastructure';
const PLACE =
  'Remote (United States, Canada, United Kingdom, Ireland, Germany, Netherlands, Spain, Portugal)';
const POSTS = [
  ['1', `Orbit | ${LONG_TITLE} | ${PLACE}<p>Own our design system and design tokens.</p>`],
  ['2', `Lumen | Design Systems ${UNBROKEN} | Remote<p>Lead the design system.</p>`],
  ['3', 'Kite | Design Systems Engineer | Remote<p>Work on our design system.</p>'],
];

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

test.use({ viewport: { width: 390, height: 844 } });

test('Find at 390: no sideways scroll and no card wider than the screen, long titles too', async ({
  page,
}) => {
  await feed(page);
  await page.goto(`${PROD_URL}/#/review`);
  await expect(page.getByRole('region', { name: 'New postings' })).toBeVisible();
  await accountMenuItem(page, 'Scan now');
  const list = page.getByRole('list', { name: 'New postings' });
  await expect(list.getByRole('link', { name: /Prime Design Systems/ })).toBeVisible({
    timeout: 60_000,
  });
  const m = await page.evaluate(() => {
    const se = document.scrollingElement!;
    const vw = document.documentElement.clientWidth;
    const cards = [...document.querySelectorAll('[aria-label="New postings"] article')].map((c) => {
      const r = c.getBoundingClientRect();
      return { left: r.left, right: r.right, width: r.width };
    });
    return { scrollWidth: se.scrollWidth, clientWidth: se.clientWidth, vw, cards };
  });
  expect(m.cards.length).toBeGreaterThan(0);
  expect(m.scrollWidth, 'Find scrolls sideways').toBeLessThanOrEqual(m.clientWidth);
  for (const c of m.cards) {
    expect(c.width).toBeLessThanOrEqual(m.vw);
    expect(c.left).toBeGreaterThanOrEqual(0);
    expect(c.right).toBeLessThanOrEqual(m.vw + 0.5);
  }
});
