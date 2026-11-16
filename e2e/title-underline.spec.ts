import { test, expect, type Page } from './fixtures';

// Review reads postings only for a signed-in visitor (#755).
test.use({ signedIn: true });

// A Review card's title link (Adrian 2026-11-15): no underline at rest; the underline shows on
// hover (a pointer that can hover) and on keyboard focus. The external icon stays below lg.
// Synthetic Greenhouse boards (no real people); every other host answers empty.
const LEAK = 'Remote, Lithuania';
const LONG = 'Remote, Europe';
const SHOTS = process.env.TITLE_SHOTS;

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
    if (url.startsWith('https://api.ashbyhq.com/')) return json({ jobs: [] });
    if (url.startsWith('https://hn.algolia.com/')) return json({ hits: [] });
    if (!url.startsWith('https://boards-api.greenhouse.io/')) return r.abort();
    const at = new Date().toISOString();
    const job = (id: number, title: string, company: string, location: string) => ({
      id,
      title,
      company_name: company,
      absolute_url: `https://example.com/jobs/${id}`,
      location: { name: location },
      first_published: at,
      updated_at: at,
      content: '&lt;p&gt;Own the design system and its tokens.&lt;/p&gt;',
    });
    return json({
      jobs: [
        job(1, 'Senior Design Systems Designer', 'Talva', LEAK),
        job(2, 'Design Systems Engineer', 'Norrow', LONG),
      ],
    });
  });
}

const lineOf = (page: Page) =>
  page
    .getByRole('article', { name: /Design Systems Engineer at Norrow/ })
    .locator('h3 .hds-link')
    .evaluate((el) => getComputedStyle(el).textDecorationLine);

async function open(page: Page, scheme: 'light' | 'dark') {
  await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
  await feed(page);
  await page.goto('/#/review');
  await expect(page.getByRole('region', { name: 'New postings' })).toBeVisible();
  await expect(
    page.getByRole('article', { name: /Design Systems Engineer at Norrow/ }),
  ).toBeVisible({
    timeout: 60_000,
  });
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`390 ${scheme}`, () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
    test('the title has no underline at rest, its icon stays', async ({ page }) => {
      await open(page, scheme);
      expect(await lineOf(page)).toBe('none');
      const card = page.getByRole('article', { name: /Design Systems Engineer at Norrow/ });
      await expect(card.locator('h3 .hds-ext-icon')).toBeVisible();
      if (SHOTS) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: `${SHOTS}/title-390-${scheme}.png` });
      }
    });
  });
}

test.describe('1440', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test('the underline shows on hover and on keyboard focus only', async ({ page }) => {
    await open(page, 'light');
    expect(await lineOf(page)).toBe('none');
    const link = page
      .getByRole('article', { name: /Design Systems Engineer at Norrow/ })
      .locator('h3 .hds-link');
    await link.hover();
    expect(await lineOf(page)).toContain('underline');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/title-1440-hover.png` });
    await page.mouse.move(1400, 880);
    expect(await lineOf(page)).toBe('none');
    await link.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect.poll(() => lineOf(page)).toContain('underline');
  });
});
