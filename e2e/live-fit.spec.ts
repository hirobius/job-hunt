import { test, expect } from '@playwright/test';

// Live postings' fit control (round-2 review): with evidence, each opening's fit opens Fit and gap.
// It must read as a control (an icon inside, not a bare badge) and sit on its own line: its hit area
// never overhangs the line or overlaps the title link under it. Synthetic Hacker News posts.
for (const width of [390, 1440]) {
  test(`the fit control is tappable and clear of the title (${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() =>
      localStorage.setItem(
        'rjb_radar_evidence',
        'Design systems engineer. Built design tokens, React component libraries, Figma.',
      ),
    );
    await page.route(/^https?:\/\/(?!localhost)/, (r) => {
      const url = r.request().url();
      if (!url.startsWith('https://hn.algolia.com/')) return r.abort();
      const json = (body: unknown) =>
        r.fulfill({
          status: 200,
          headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
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
      const term = new URL(url).searchParams.get('query') || 'x';
      return json({
        hits: [
          {
            objectID: `p-${term}`,
            story_id: 9,
            parent_id: 9,
            created_at: '2026-10-10T10:00:00Z',
            comment_text: `Acme | ${term} | Remote | REMOTE<p>Hiring a ${term}. React, design tokens.</p>`,
          },
        ],
      });
    });

    await page.goto('/#/discover');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Finish' }).click();
    await page.goto('/#/discover/live');

    const list = page.getByRole('list', { name: 'Live postings' });
    const row = list.getByRole('listitem').first();
    const fit = row.getByRole('button', { name: /^Why / });
    await expect(fit).toBeVisible();
    // A control, not a bare badge: an icon says it opens something.
    await expect(fit.locator('svg')).toHaveCount(1);
    const title = row.getByRole('heading', { level: 3 }).getByRole('link');
    const f = (await fit.boundingBox())!;
    const t = (await title.boundingBox())!;
    // Its hit area ends above the title's (no overlap) and it fits its own line (no overhang).
    expect(f.y + f.height).toBeLessThanOrEqual(t.y + 0.5);
    const line = (await fit.evaluate((e) => e.parentElement!.getBoundingClientRect().toJSON())) as {
      top: number;
      bottom: number;
    };
    expect(f.y).toBeGreaterThanOrEqual(line.top - 0.5);
    expect(f.y + f.height).toBeLessThanOrEqual(line.bottom + 0.5);
    if (width < 640) expect(Math.round(f.height)).toBeGreaterThanOrEqual(40);
  });
}
