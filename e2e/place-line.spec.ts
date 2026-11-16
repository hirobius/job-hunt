import { test, expect, type Page } from './fixtures';
import { accountMenuItem } from './routes';

// Review reads postings only for a signed-in visitor (#755).
test.use({ signedIn: true });

// A card's place is a place, on one line (Adrian 2026-11-15): a source that runs the posting's
// first lines into its location (Surfshark on designsystems.jobs: "Lithuania This role sits in…")
// shows only the place, and a long place ends in an ellipsis. Synthetic Greenhouse boards (no real
// people); every other host answers empty.
const LEAK =
  'Remote, Lithuania This role sits in the Experience Design team and owns the unified design system';
const LONG = 'Remote within the European Union, the United Kingdom, Norway, Switzerland or Iceland';
const SHOTS = process.env.PLACE_SHOTS;

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

test.use({ viewport: { width: 390, height: 844 } });

for (const scheme of ['light', 'dark'] as const) {
  test(`a card's place is the place, on one line (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await feed(page);
    await page.goto('/#/review');
    await expect(page.getByRole('region', { name: 'New postings' })).toBeVisible();
    const leak = page.getByRole('article', { name: /Senior Design Systems Designer at Talva/ });
    const long = page.getByRole('article', { name: /Design Systems Engineer at Norrow/ });
    await expect(leak).toBeVisible({ timeout: 60_000 });
    await expect(long).toBeVisible();
    await expect(leak.getByText('Remote, Lithuania…', { exact: true })).toBeVisible();
    await expect(leak).not.toContainText('This role sits');
    // One line: the place is no taller than the posted day's line, and cut with an ellipsis.
    const place = long.locator('[data-slot="card-facts"] > li').first();
    const day = long.locator('[data-slot="card-facts"] > li').last();
    const [p, d] = [await place.boundingBox(), await day.boundingBox()];
    expect(p!.height).toBeLessThanOrEqual(d!.height + 1);
    expect(await place.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    if (SHOTS) {
      await leak.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${SHOTS}/place-390-${scheme}.png` });
    }
  });
}
