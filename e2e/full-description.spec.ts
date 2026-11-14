import { test, expect, type Page } from '@playwright/test';
import { accountMenuItem } from './routes';

// Find's detail shows a posting's FULL description with its structure (2026-11-13, Adrian on
// Ramp's Ashby postings: cut with "…", headings and lists flattened). A mocked Ashby board answers
// one design-systems posting whose HTML has all-caps headings, paragraphs and lists, longer than the
// auto-scan's 1500-character body cut; every other host answers empty.
const TAIL = 'This is the very last sentence of the description.';
const LONG = 'We build the design system that every Ramp product team ships with. '.repeat(30);
const HTML =
  `<p><strong>ABOUT THE TEAM</strong></p><p>${LONG}</p>` +
  `<h2>ABOUT THE ROLE</h2><ul><li>Own the design tokens</li><li>Ship the component docs</li></ul>` +
  `<h3>What you bring</h3><ol><li>Five years of UI engineering</li></ol><p>${TAIL}</p>` +
  `<p><a href="javascript:alert(1)">bad link</a><script>window.__xss = 1</script></p>`;

async function feed(page: Page) {
  await page.route(/^https?:\/\/(?!localhost)/, (r) => {
    const url = r.request().url();
    const json = (body: unknown) =>
      r.fulfill({
        status: 200,
        headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    if (url === 'https://api.ashbyhq.com/posting-api/job-board/langchain')
      return json({
        jobs: [
          {
            id: 'j1',
            title: 'Design Systems Engineer',
            jobUrl: 'https://jobs.ashbyhq.com/langchain/j1',
            location: 'Remote',
            workplaceType: 'Remote',
            isListed: true,
            publishedAt: new Date().toISOString(),
            descriptionHtml: HTML,
            descriptionPlain: `ABOUT THE TEAM\n${LONG}\nABOUT THE ROLE\nOwn the design tokens\n${TAIL}`,
          },
        ],
      });
    if (url.startsWith('https://api.lever.co/')) return json([]);
    if (
      /^https:\/\/(boards-api\.greenhouse\.io|api\.ashbyhq\.com|remotive\.com|jobicy\.com)\//.test(
        url,
      )
    )
      return json({ jobs: [] });
    if (url.startsWith('https://hn.algolia.com/')) return json({ hits: [] });
    return r.abort();
  });
}

test('the detail shows the whole description, structured, no ellipsis (1440)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await feed(page);
  await page.goto('/#/review');
  await expect(page.getByRole('region', { name: 'New postings' })).toBeVisible({ timeout: 30_000 });
  await accountMenuItem(page, 'Scan now');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Design Systems Engineer' }),
  ).toBeVisible({
    timeout: 60_000,
  });
  const desc = page.locator('[data-rjb-description]');
  await expect(desc.getByRole('heading', { level: 3, name: 'About the role' })).toBeVisible();
  await expect(desc.getByRole('heading', { level: 4, name: 'About the team' })).toBeVisible();
  await expect(desc.getByRole('heading', { level: 4, name: 'What you bring' })).toBeVisible();
  await expect(desc.getByRole('list')).toHaveCount(2);
  await expect(desc.getByRole('listitem')).toHaveText([
    'Own the design tokens',
    'Ship the component docs',
    'Five years of UI engineering',
  ]);
  await expect(desc.getByText(TAIL)).toBeVisible();
  const text = await desc.innerText();
  expect(text).not.toContain('…');
  expect(text).not.toMatch(/ABOUT/);
  await expect(desc.getByRole('link', { name: 'bad link' })).toHaveCount(0);
  expect(await page.evaluate(() => (window as { __xss?: number }).__xss)).toBeUndefined();
  await page.screenshot({ path: 'test-results/full-description-1440.png', fullPage: true });
});
