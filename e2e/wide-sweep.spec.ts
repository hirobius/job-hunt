import { test, expect } from '@playwright/test';

// The wide sweep (#213) end to end, at phone and desktop width: one "Find more" sweep searches
// every title that is on, a title chip hides its rows without a re-fetch, and a save lands in the
// Pipeline's To apply queue. The feed is synthetic Hacker News posts (no real people).
for (const width of [390, 1440]) {
  test(`sweep every title, filter by title, save into To apply (${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    let reads = 0;
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
      reads++;
      // One post per searched term, titled with it, so each row matches its own title.
      const term = new URL(url).searchParams.get('query') || 'x';
      return json({
        hits: [
          {
            objectID: `p-${term}`,
            story_id: 9,
            parent_id: 9,
            created_at: '2026-10-10T10:00:00Z',
            comment_text: `Acme ${term.length} | ${term} | Remote | REMOTE<p>Hiring a ${term}.</p>`,
          },
        ],
      });
    });

    await page.goto('/#/discover');
    await page.getByRole('group', { name: 'Starter tracks' }).getByRole('checkbox').first().click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Finish' }).click();

    await page.goto('/#/discover/live');
    await page.getByRole('button', { name: /^Find more: sweep all \d+ titles$/ }).click();
    await expect(
      page.getByRole('heading', { name: /^Sweeping \d+ titles at once$/ }),
    ).toBeVisible();
    const chips = page.getByRole('group', { name: 'Show titles' });
    await expect(chips).toBeVisible();
    const list = page.getByRole('list', { name: 'Live postings' });
    const before = await list.getByRole('listitem').count();
    expect(before).toBeGreaterThan(2);
    await page.screenshot({ path: `test-results/wide-sweep-${width}.png`, fullPage: true });

    // Hiding every title empties the list without a single new read; showing one brings rows back.
    const readsBefore = reads;
    const buttons = chips.getByRole('button');
    for (let i = 0, n = await buttons.count(); i < n; i++) await buttons.nth(i).click();
    await expect(list).toBeHidden();
    await expect(page.getByText('Every title is hidden — turn one back on above.')).toBeVisible();
    await buttons.first().click();
    await expect(list.getByRole('listitem').first()).toBeVisible();
    expect(reads).toBe(readsBefore);

    // The title filter sits in Calibrate (#223).
    await page.getByRole('button', { name: 'Calibrate' }).click();
    await expect(page.getByRole('list', { name: 'Titles' })).toBeVisible();
    await page.screenshot({ path: `test-results/wide-sweep-titles-${width}.png`, fullPage: true });

    await list.getByRole('button', { name: 'Save' }).first().click();
    const notice = page
      .getByRole('region', { name: /^Notifications/ })
      .getByRole('listitem')
      .filter({ hasText: 'Saved to Pipeline · To apply' });
    await expect(notice).toBeVisible();
    await page.goto('/#/queue');
    await expect(page.getByRole('region', { name: 'To apply (1)' })).toBeVisible();
  });
}
