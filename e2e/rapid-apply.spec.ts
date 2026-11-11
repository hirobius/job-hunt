import { test, expect } from '@playwright/test';
import { topTab } from './routes';

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
  await page.goto('/#/find');

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
  await page.getByRole('button', { name: 'All jobs' }).click();
  const jobs = page.getByRole('dialog', { name: 'All jobs' }).getByRole('region', { name: 'Jobs' });
  await expect(jobs.locator('a[href^="#/apply/"]')).toHaveCount(3);
  await jobs.locator('a[href^="#/apply/"]').first().click();
  await expect(page.getByRole('dialog', { name: 'All jobs' })).toBeHidden();

  // The kit: enter a name once (empty fields wait behind one row), copy it.
  await page.getByRole('button', { name: /^Fill in \d+ more/ }).click();
  await page.getByRole('button', { name: 'Add Name' }).click();
  await page.getByRole('textbox', { name: 'Name' }).fill('Sam Placeholder');
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Copy Name' }).click();
  await expect(page.getByRole('button', { name: 'Copied Name' })).toBeVisible();

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

  // Nothing left to apply to: the tab still shows a job, and All jobs has Follow up (3).
  await page.getByRole('button', { name: 'All jobs' }).click();
  await expect(
    page.getByRole('dialog', { name: 'All jobs' }).getByRole('region', { name: 'Follow up (3)' }),
  ).toBeVisible();
});

// The Apply sheet (#239): the starter templates show filled for the job, one copy row each, and the
// sheet fits a 390 phone with no sideways scroll and 40px copy targets.
test('Apply sheet: templates filled for the job, copyable at 390', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  await page.goto(
    '/?add=' + encodeURIComponent('https://acme.example/jobs/1') + '&t=Acme+Designer',
  );
  // The quick add lands on Apply, which below lg is the job itself (Proposal A).
  await expect(page.getByRole('heading', { level: 1, name: 'Acme Designer' })).toBeVisible();
  // Templates start closed on a new device (Proposal A); open them.
  await page.getByRole('button', { name: /^Templates \(/ }).click();
  // A first run has no messages (Adrian 2026-10-22): one tap adds the starters here.
  await page
    .getByRole('region', { name: 'Templates' })
    .getByRole('button', { name: 'Add starter messages' })
    .click();

  const list = page.getByRole('list', { name: 'Your templates' });
  await expect(list.getByRole('listitem').first()).toBeVisible();
  const intro = list.getByRole('listitem', { name: 'Outreach note' });
  await intro.getByRole('button', { name: 'Copy Outreach note' }).click();
  await expect(intro.getByRole('button', { name: 'Copied Outreach note' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('Acme Designer');

  const sideways = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(sideways).toBe(false);
  for (const box of await list
    .getByRole('button')
    .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height)))
    expect(box).toBeGreaterThanOrEqual(40);
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
