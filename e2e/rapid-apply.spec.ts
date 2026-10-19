import { test, expect } from '@playwright/test';

// The rapid-apply loop end to end: cast a wide net in Live postings, see where the saves went,
// then walk the To apply queue in Apply mode until it is empty and everything waits on a follow-up.
// The feed is answered with synthetic Hacker News posts (no real people); every other host fails.
test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

test('save 3 postings → To apply (3) → apply to each → Follow up (3)', async ({ page }) => {
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
    // Echo the searched term into each title so the posts match whatever the track searches.
    const term = new URL(url).searchParams.get('query') || 'design';
    return json({
      hits: ['Acme', 'Bolt', 'Cask'].map((co, i) => ({
        objectID: String(100 + i),
        story_id: 9,
        parent_id: 9,
        created_at: '2026-10-10T10:00:00Z',
        comment_text: `${co} Labs | Senior ${term} | Remote | REMOTE<p>We use ${term} every day.`,
      })),
    });
  });

  // A track first (Discover needs one): the first starter pack, three steps.
  await page.goto('/#/discover');
  await page.getByRole('group', { name: 'Starter tracks' }).getByRole('checkbox').first().click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Finish' }).click();

  // Wide net: pick all three postings and save them in one go.
  await page.goto('/#/discover/live');
  const picks = page.getByRole('checkbox', { name: /^Pick / });
  await expect(picks).toHaveCount(3);
  for (let i = 0; i < 3; i++) await picks.nth(i).check();
  await page.getByRole('button', { name: 'Save 3 to Pipeline' }).click();
  const notice = page.getByRole('status').filter({ hasText: 'Saved 3 to Pipeline · To apply' });
  await expect(notice).toBeVisible();
  await expect(page.getByRole('button', { name: 'Saved' })).toHaveCount(3);
  await notice.getByRole('button', { name: 'Open' }).click();

  await expect(page.getByRole('region', { name: 'To apply (3)' })).toBeVisible();
  await page.getByRole('button', { name: 'Start applying' }).click();
  await expect(page).toHaveURL(/#\/apply\//);

  // The kit: enter a name once, copy it.
  await page.getByRole('button', { name: 'Add Name' }).click();
  await page.getByRole('textbox', { name: 'Name' }).fill('Sam Placeholder');
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Copy Name' }).click();
  await expect(page.getByRole('button', { name: 'Copied Name' })).toBeVisible();

  for (let left = 3; left > 0; left--) {
    await expect(page.getByRole('link', { name: /Open application/ })).toBeVisible();
    await page.getByRole('button', { name: 'Mark applied' }).click();
    await expect(page.getByText(/Follow up on \d{4}-\d{2}-\d{2}/)).toBeVisible();
    if (left > 1) await page.getByRole('button', { name: `Next job (1 of ${left - 1})` }).click();
    else await page.getByRole('button', { name: /To apply is empty/ }).click();
  }

  await expect(page.getByRole('region', { name: 'To apply (0)' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Follow up (3)' })).toBeVisible();
});
