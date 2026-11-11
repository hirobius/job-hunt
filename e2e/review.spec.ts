import { test, expect, type Page } from '@playwright/test';

// Review new (simplify 5/9, #386) end to end on Today, at phone and desktop width: Browse lists every
// undecided posting with "N new today from M sources", Skip hides only that posting (its company's
// other posting stays), Save lands in the Pipeline's To apply, and the Deck shows one card at a
// time. The feed is synthetic Hacker News posts (no real people); every other host answers empty.
// Kite's UX Engineer is in the list: Design Engineer (with UX Engineer) is a related title on by
// default (#581). Ferro's Mechanical Design Engineer is read (it says a searched title) but the
// design engineer guard (tracks/designRoleGuard.ts) keeps it out, so it is the one counted.
const POSTS = [
  ['1', 'Orbit | Design Systems Engineer | Remote<p>Own our design system and design tokens.</p>'],
  ['2', 'Orbit | Design Systems Designer | Remote<p>Figma library and design tokens.</p>'],
  ['3', 'Lumen | Design Systems Lead | Remote<p>Lead the design system and Storybook.</p>'],
  ['4', 'Kite | UX Engineer | Remote<p>Work on our design system.</p>'],
  ['5', 'Nimbus | Backend Engineer | Remote<p>Go and Postgres.</p>'],
  ['6', 'Ferro | Mechanical Design Engineer | Remote<p>Enclosures, CAD and sheet metal.</p>'],
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
  await expect(page.getByRole('button', { name: 'Browse' })).toBeVisible();
  const since = await page.evaluate(() => Date.now());
  await page.getByRole('button', { name: 'Scan now' }).click();
  await scanFinished(page, since);
}

/** A scan run since `since` has finished (Find shows no scan line since 2026-11-08: the run's end
 *  is in its stored state). */
async function scanFinished(page: Page, since: number, timeout = 60_000) {
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (JSON.parse(localStorage.getItem('rjb_autoscan') || '{}') as { finishedAt?: number })
              .finishedAt ?? 0,
        ),
      { timeout },
    )
    .toBeGreaterThan(since);
}

for (const width of [390, 1440]) {
  test(`browse, skip one posting, save one, then the deck (${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await setUp(page);
    await expect(page.getByRole('heading', { name: 'Review new' })).toBeVisible();
    // No status text above Browse / Deck (Adrian 2026-11-08): no scan line, counts or progress.
    await expect(
      page.getByText(
        /^Scanning |^Last scanned|^Read \d+ of \d+ boards$|unavailable · details|^Not shown/,
      ),
    ).toHaveCount(0);
    const list = page.getByRole('list', { name: 'New postings' });
    await expect(list.getByRole('listitem')).toHaveCount(4);
    await expect(list.getByRole('heading', { name: 'UX Engineer', exact: true })).toBeVisible();
    await expect(list.getByRole('heading', { name: /Mechanical Design Engineer/ })).toHaveCount(0);
    // No fit tiers: every design-system posting is in the one list; the rest are counted. (The
    // HN source keeps a post only when it says a searched title, so Nimbus's is never read.)
    // The count is in the Account menu's Scan details (Adrian 2026-11-08), not on the page.
    await page.getByRole('button', { name: 'Account' }).click();
    await page.getByRole('menuitem', { name: 'Scan details' }).click();
    const details = page.getByRole('dialog', { name: 'Scan details' });
    await expect(details.getByText(/1 not design-system roles/)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(details).toBeHidden();
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.screenshot({ path: `test-results/review-${width}-${scheme}.png`, fullPage: true });
    }
    await page.emulateMedia({ colorScheme: 'light' });

    if (width >= 1024) {
      // At lg a title selects the posting for the detail column (#471 slice 3), in place.
      await list.getByRole('link', { name: 'Design Systems Designer', exact: true }).click();
      await expect(page).toHaveURL(/#\/find\/.+/);
      await expect(
        page.getByRole('heading', { level: 1, name: 'Design Systems Designer' }),
      ).toBeVisible();
      // Its action row has the posting's own Open posting icon link (Adrian 2026-11-08).
      const detail = page.locator('section[aria-labelledby="rjb-posting-title"]');
      await expect(detail.getByRole('link', { name: /^Open posting for / })).toBeVisible();
      await page.screenshot({ path: `test-results/review-selected-${width}.png` });
      await expect(list).toBeVisible();
      await page.evaluate(() => (location.hash = '#/find'));
    } else {
      // Below lg there is no posting page (Adrian 2026-11-08): the card shows its description.
      const card = list.getByRole('article').filter({ hasText: 'Design Systems Designer' }).first();
      await expect(
        card.getByRole('link', { name: 'Design Systems Designer', exact: true }),
      ).toHaveCount(0);
      await card.getByRole('button', { name: 'Show description' }).click();
      await expect(card.getByRole('button', { name: 'Hide description' })).toBeVisible();
      await expect(page).toHaveURL(/#\/find$/);
      await page.screenshot({ path: `test-results/review-selected-${width}.png` });
    }
    await expect(page.getByRole('heading', { level: 1, name: 'Find' })).toBeVisible();

    // Skip hides only that posting: Orbit's other one stays.
    await list.getByRole('button', { name: 'Skip Design Systems Engineer at Orbit' }).click();
    await expect(list.getByRole('listitem')).toHaveCount(3);
    await expect(
      list.getByRole('heading', { name: 'Design Systems Designer', exact: true }),
    ).toBeVisible();

    // Past the double-tap guard (answerGuard.ts), so the next decision is a new one.
    await page.waitForTimeout(800);
    // #534: Skip says so with Undo (no confirm), and Save is the filled key with a plus icon.
    await expect(
      page.getByRole('region', { name: /^Notifications/ }).getByRole('button', { name: 'Undo' }),
    ).toBeVisible();
    const save = list.getByRole('button', { name: 'Save Design Systems Lead at Lumen' });
    await expect(save).toHaveAttribute('data-variant', 'primary');
    await expect(save.locator('svg')).toHaveCount(1);
    // A double Save saves once, with one toast (#534).
    await save.dblclick();
    const notice = page.getByRole('region', { name: /^Notifications/ }).getByRole('listitem');
    await expect(notice.getByText('Added to Apply: Design Systems Lead')).toBeVisible();
    await expect(notice).toHaveCount(1);
    await expect(notice.getByRole('button', { name: 'Open' })).toBeVisible();
    await expect(notice.getByRole('button', { name: 'Undo' })).toBeVisible();
    await expect(page.getByText(/shortlist/i)).toHaveCount(0);
    await expect(list.getByRole('listitem')).toHaveCount(2);

    // The deck: one card at a time, Skip each of the two left. Past the double-tap guard first: it
    // swallows any press inside the page for 700 ms after Save, Deck's too.
    await page.waitForTimeout(800);
    const deck = page.getByRole('button', { name: 'Deck' });
    await deck.click();
    await expect(deck).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('article')).toHaveCount(1);
    await page.screenshot({ path: `test-results/review-deck-${width}.png`, fullPage: true });
    for (let left = 2; left > 0; left--) {
      // Past the double-tap guard again.
      await page.waitForTimeout(800);
      await page
        .getByRole('article')
        .getByRole('button', { name: /^Skip / })
        .click();
      if (left > 1) await expect(page.getByRole('article')).toHaveCount(1);
    }
    await expect(page.getByText('You’re all caught up')).toBeVisible();

    // Back on the Pipeline, the save is in To apply.
    await page.goto('/#/apply');
    await expect(page.getByText('Design Systems Lead').first()).toBeVisible();
  });
}
