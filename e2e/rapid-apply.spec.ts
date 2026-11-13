import { test, expect } from '@playwright/test';
import { topTab, pressAllJobs } from './routes';

// The rapid-apply loop end to end: save from Review new on Today, see where the saves went,
// then walk the Apply list until nothing is left to apply to and everything waits on a follow-up.
// The feed is answered with synthetic Hacker News posts (no real people); every other host fails.
test.use({ permissions: ['clipboard-read', 'clipboard-write'] });
// The phone flow: a job opened from the Apply list walks it (#471: no Apply mode or Start applying);
// from lg the list sits beside the job's Apply view (the 1440 test below).
test.use({ viewport: { width: 390, height: 844 } });

test('save 3 postings → the Apply list → apply to each → Follow up (3)', async ({ page }) => {
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

  // A first visit gets the design-systems Search profile on its own (no setup screen).
  await page.goto('/#/review');

  // Save all three postings from Review new; each leaves the list and says where it went.
  const list = page.getByRole('list', { name: 'New postings' });
  await expect(list.getByRole('listitem')).toHaveCount(3, { timeout: 30_000 });
  for (let left = 3; left > 0; left--) {
    await list
      .getByRole('button', { name: /^Save / })
      .first()
      .click();
    await expect(list.getByRole('listitem')).toHaveCount(left - 1);
    // Past the double-tap guard (answerGuard.ts), so the next Save is a new decision.
    await page.waitForTimeout(800);
  }
  const notice = page
    .getByRole('region', { name: /^Notifications/ })
    .getByRole('listitem')
    .filter({ hasText: /^Added to Apply: / });
  // #534: the toast says where it went, with Open and Undo; the Apply tab has all three in To apply.
  await expect(notice).toBeVisible();
  await expect(notice.getByRole('button', { name: 'Undo' })).toBeVisible();
  await notice.getByRole('button', { name: 'Open' }).click();
  await expect(page).toHaveURL(/#\/apply\/[^/?]+/);
  await topTab(page, 'Apply').click();

  // Below lg the tab is one job (Proposal A); its list is the All jobs sheet.
  await pressAllJobs(page);
  const jobs = page
    .getByRole('dialog', { name: 'All jobs' })
    .getByRole('navigation', { name: 'Jobs' });
  await expect(jobs.locator('a[href^="#/apply/"]')).toHaveCount(3);
  await jobs.locator('a[href^="#/apply/"]').first().click();
  await expect(page.getByRole('dialog', { name: 'All jobs' })).toBeHidden();

  // The kit: enter a name once (empty fields wait behind one row), copy it.
  await page.getByRole('button', { name: 'Add them' }).click();
  await page.getByRole('button', { name: 'Add Name' }).click();
  await page.getByRole('textbox', { name: 'Name' }).fill('Sam Placeholder');
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Copy Name' }).click();
  // The chip keeps its name; it shows "Copied" and the status says it (#593).
  await expect(page.getByRole('button', { name: 'Copy Name' })).toHaveText('Copied');

  // Mark applied moves on to the next job in the list, in place; the last goes back to the list.
  for (let n = 1; n <= 3; n++) {
    await expect(page.getByRole('link', { name: /Open application/ })).toBeVisible();
    const pager = page.getByRole('navigation', { name: 'Jobs in the list' });
    await expect(pager).toContainText(`1 of ${4 - n}`);
    // The three postings share a title, so watch the job's own address.
    const shown = page.url();
    await page.getByRole('button', { name: /^Mark applied/ }).click();
    if (n < 3) await expect.poll(() => page.url()).not.toBe(shown);
    // Past the double-tap guard (JobHeader DOUBLE_TAP_MS), so the next tap is a new answer.
    await page.waitForTimeout(800);
  }

  // Nothing left to apply to: the done state (#554), the icon tile, the week, then two keys. All jobs
  // opens the view's first job, and All jobs counts the 3 under Applied (the view chip, #543).
  const done = page.getByRole('region', { name: 'That is the list' });
  await expect(done).toBeVisible();
  await expect(done.locator('[aria-hidden="true"] svg')).toBeVisible();
  await expect(done.getByText('You applied to 3 jobs this week.')).toBeVisible();
  await expect(done.getByRole('button', { name: 'Find more jobs' })).toBeVisible();
  await done.getByRole('button', { name: 'All jobs' }).click();
  await expect(done).toBeHidden();
  await pressAllJobs(page);
  await expect(
    page.getByRole('dialog', { name: 'All jobs' }).getByRole('button', { name: 'Applied 3' }),
  ).toBeVisible();
});

// #540: sections show only with content. A first run has no messages: no message rows and no
// Templates disclosure, one tap adds the starters, and then the message rows show. It fits 390.
test('a job with no messages: no message rows; one tap adds the starters, at 390', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  await page.goto(
    '/?add=' + encodeURIComponent('https://acme.example/jobs/1') + '&t=Acme+Designer',
  );
  await expect(page.getByRole('heading', { level: 1, name: 'Acme Designer' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Templates \(/ })).toHaveCount(0);
  const kit = page.getByRole('region', { name: 'Copy into the form' });
  await expect(kit.getByRole('button', { name: /^Why this company/ })).toHaveCount(0);
  await kit.getByRole('button', { name: 'Add starter messages' }).click();
  await expect(kit.getByRole('button', { name: /^Why this company/ })).toBeVisible();
  const sideways = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(sideways).toBe(false);
  const edit = await page.getByRole('link', { name: 'Edit documents' }).boundingBox();
  expect(edit?.height).toBeGreaterThanOrEqual(40);
});

// From lg (#471): the Jobs tab opens on the first job's Apply view beside the list; Mark applied
// moves on to the next job in place.
test('at 1440 the Jobs tab is the list beside the job, and Mark applied walks it', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  for (const [n, t] of [
    [1, 'Acme Designer'],
    [2, 'Bolt Designer'],
  ] as const)
    await page.goto(`/?add=${encodeURIComponent(`https://acme.example/jobs/${n}`)}&t=${t}`);
  await topTab(page, 'Apply').click();
  await page.evaluate(() => (location.hash = '#/apply'));
  const rail = page.getByRole('navigation', { name: 'Jobs' });
  await expect(rail.locator('a[href^="#/apply/"]')).toHaveCount(2);
  const first = (await page.getByRole('heading', { level: 1 }).textContent())!.trim();
  await expect(page.getByRole('link', { name: /Open application/ })).toBeVisible();
  await page.getByRole('button', { name: `Mark applied: ${first}` }).click();
  await expect(page.getByRole('heading', { level: 1 })).not.toHaveText(first);
  await expect(page).toHaveURL(/#\/apply\/[^/?]+/);
});
