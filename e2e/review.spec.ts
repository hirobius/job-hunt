import { test, expect, type Page } from '@playwright/test';

// Review new (simplify 5/9, #386) end to end on Today, at phone and desktop width: Browse lists every
// undecided posting with "N new today from M sources", Skip hides only that posting (its company's
// other posting stays), Save lands in the Pipeline's To apply, and the Deck shows one card at a
// time. The feed is synthetic Hacker News posts (no real people); every other host answers empty.
const POSTS = [
  ['1', 'Orbit | Design Systems Engineer | Remote<p>Own our design system and design tokens.</p>'],
  ['2', 'Orbit | Design Systems Designer | Remote<p>Figma library and design tokens.</p>'],
  ['3', 'Lumen | Design Systems Lead | Remote<p>Lead the design system and Storybook.</p>'],
  ['4', 'Kite | UX Engineer | Remote<p>Work on our design system.</p>'],
  ['5', 'Nimbus | Backend Engineer | Remote<p>Go and Postgres.</p>'],
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
    // The pack's watched boards answer with no openings.
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

async function setUp(page: Page) {
  await feed(page);
  await page.goto('/#/find');
  // A first visit gets the design-systems Search profile on its own (no setup screen).
  await expect(page).toHaveURL(/#\/find$/);
  await expect(page.getByRole('heading', { name: 'Review new' })).toBeVisible();
  // The profile has landed (Review new's own controls show), so the page no longer swaps under
  // the click. Signed out, nothing scans on open (2026-11-07): Scan now does.
  await expect(page.getByRole('radio', { name: 'Browse' })).toBeVisible();
  await page.getByRole('button', { name: 'Scan now' }).click();
  await expect(page.getByText(/^Not scanned yet/)).toHaveCount(0);
}

for (const width of [390, 1440]) {
  test(`browse, skip one posting, save one, then the deck (${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await setUp(page);
    await expect(page.getByRole('heading', { name: 'Review new' })).toBeVisible();
    // One count on the page: the scan's line says the sources scanned and the Feed's new count.
    await expect(
      page.getByText(/^Scanning [\d,]+ sources? · Last scanned \d\d:\d\d, \d+ new$/),
    ).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByText(/new today from/)).toHaveCount(0);
    // Every board has answered.
    await expect(page.getByText(/^Read \d+ of \d+ boards$/)).toHaveCount(0, { timeout: 15_000 });
    const list = page.getByRole('list', { name: 'New postings' });
    await expect(list.getByRole('listitem')).toHaveCount(3);
    // No fit tiers: every design-system posting is in the one list; the rest are counted. (The
    // HN source keeps a post only when it says a searched title, so Nimbus's is never read.)
    await expect(page.getByText(/1 not design-system roles/)).toBeVisible();
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.screenshot({ path: `test-results/review-${width}-${scheme}.png`, fullPage: true });
    }
    await page.emulateMedia({ colorScheme: 'light' });

    // A title selects the posting (#471 slice 3), with Open posting one tap away: beside the list
    // at lg (in place), its own view below lg (Back returns to the list).
    await list.getByRole('link', { name: 'Design Systems Designer', exact: true }).click();
    await expect(page).toHaveURL(/#\/find\/.+/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Design Systems Designer' }),
    ).toBeVisible();
    // The posting's own Open posting (each list card has an icon link of its own beside its title).
    await expect(page.getByRole('link', { name: 'Open posting', exact: true })).toBeVisible();
    await page.screenshot({ path: `test-results/review-selected-${width}.png` });
    if (width < 1024) {
      await page.goBack();
      await expect(page).toHaveURL(/#\/find$/);
    } else {
      await expect(list).toBeVisible();
      await page.evaluate(() => (location.hash = '#/find'));
    }
    await expect(page.getByRole('heading', { level: 1, name: 'Find' })).toBeVisible();

    // Skip hides only that posting: Orbit's other one stays.
    await list.getByRole('button', { name: 'Skip Design Systems Engineer at Orbit' }).click();
    await expect(list.getByRole('listitem')).toHaveCount(2);
    await expect(
      list.getByRole('link', { name: 'Design Systems Designer', exact: true }),
    ).toBeVisible();

    await list.getByRole('button', { name: 'Save Design Systems Lead at Lumen' }).click();
    const notice = page.getByRole('region', { name: /^Notifications/ }).getByRole('listitem');
    await expect(notice.getByText('Saved to Pipeline · To apply')).toBeVisible();
    await expect(list.getByRole('listitem')).toHaveCount(1);

    // The deck: one card at a time.
    await page.getByRole('radio', { name: 'Deck' }).click();
    await expect(page.getByRole('article')).toHaveCount(1);
    await page.screenshot({ path: `test-results/review-deck-${width}.png`, fullPage: true });
    await page
      .getByRole('article')
      .getByRole('button', { name: /^Skip / })
      .click();
    await expect(page.getByText('You’re all caught up')).toBeVisible();

    // Back on the Pipeline, the save is in To apply.
    await page.goto('/#/apply');
    await expect(page.getByText('Design Systems Lead').first()).toBeVisible();
  });
}
