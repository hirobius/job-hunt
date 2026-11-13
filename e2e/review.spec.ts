import { test, expect, type Page } from '@playwright/test';
import { findMenuItem, openScanDetails } from './routes';
import { FILL_ONLY, selectionStyle } from './selectedFill';
import { hitArea } from './hitArea';

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

/** The detail template's shape (#546): one h1 in a title block, then one action row, then the
 *  content, at the same type and spacing on Find and Apply. */
async function templateOf(page: Page) {
  return page.evaluate(() => {
    const block = [...document.querySelectorAll('main [data-rjb-title-block]')].find(
      (el) => el.getBoundingClientRect().width > 0,
    ) as HTMLElement;
    const h1 = block.querySelector('h1') as HTMLElement;
    const keys = block.closest('header')?.querySelector('[data-rjb-actions]') as HTMLElement;
    const content = block.closest('header')?.nextElementSibling as HTMLElement;
    const b = block.getBoundingClientRect();
    const k = keys.getBoundingClientRect();
    const c = content.getBoundingClientRect();
    const key = keys.querySelector('button, a') as HTMLElement;
    return {
      ordered: b.bottom <= k.top && k.bottom <= c.top,
      h1: getComputedStyle(h1).fontSize,
      keysAfterBlock: Math.round(k.top - b.bottom),
      contentAfterKeys: Math.round(c.top - k.bottom),
      keyHeight: Math.round(key.getBoundingClientRect().height),
      firstKey: key.getAttribute('data-variant'),
    };
  });
}

async function setUp(page: Page) {
  await feed(page);
  await page.goto('/#/find');
  // A first visit gets the design-systems Search profile on its own (no setup screen).
  await expect(page).toHaveURL(/#\/find$/);
  await expect(page.getByRole('heading', { name: 'New postings' })).toBeVisible();
  // The profile has landed (Review new's own controls show), so the page no longer swaps under
  // the click. Signed out, nothing scans on open (2026-11-07): Scan now does.
  await expect(page.getByRole('button', { name: 'Browse' })).toBeVisible();
  const since = await page.evaluate(() => Date.now());
  // Scan now is Find's More menu (#544).
  await findMenuItem(page, 'Scan now');
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
    let postingTemplate: Awaited<ReturnType<typeof templateOf>> | null = null;
    // At 1440 a posting is decided in the detail column (#546): its title selects it first.
    const wide = width >= 1024;
    const decideOn = async (title: string, action: 'Save' | 'Skip', company: string) => {
      const name = `${action} ${title} at ${company}`;
      if (!wide) return list.getByRole('button', { name });
      await list.getByRole('link', { name: title, exact: true }).click();
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
      return page.locator('section[aria-labelledby="rjb-posting-title"]').getByRole('button', {
        name,
      });
    };
    await setUp(page);
    await expect(page.getByRole('heading', { name: 'New postings' })).toBeVisible();
    // No status text above Browse / Deck (Adrian 2026-11-08): no scan line, counts or progress.
    await expect(
      page.getByText(
        /^Scanning |^Last scanned|^Read \d+ of \d+ boards$|unavailable · details|^Not shown/,
      ),
    ).toHaveCount(0);
    const list = page.getByRole('list', { name: 'New postings' });
    await expect(list.getByRole('listitem')).toHaveCount(4);
    // Below lg a card's title is the link out, so its name also says it opens a new tab (#544).
    await expect(list.getByRole('heading', { name: /^UX Engineer\b/ })).toBeVisible();
    await expect(list.getByRole('heading', { name: /Mechanical Design Engineer/ })).toHaveCount(0);
    // No fit tiers: every design-system posting is in the one list; the rest are counted. (The
    // HN source keeps a post only when it says a searched title, so Nimbus's is never read.)
    // The count is in Scan details (Adrian 2026-11-08; in the Search profile since #549), not on the page.
    const details = await openScanDetails(page);
    await expect(details.getByText(/1 not design-system roles/)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(details).toBeHidden();
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.screenshot({ path: `test-results/review-${width}-${scheme}.png`, fullPage: true });
    }
    await page.emulateMedia({ colorScheme: 'light' });

    if (width >= 1024) {
      // At lg Find opens on the first posting (Adrian 2026-11-12, #546), like Apply's first job.
      await expect(page).toHaveURL(/#\/find\/.+/);
      const first = await list.getByRole('heading', { level: 3 }).first().innerText();
      await expect(page.getByRole('heading', { level: 1, name: first })).toBeVisible();
      await expect(page.getByText('Pick a posting')).toHaveCount(0);
      // A title selects another posting for the detail column (#471 slice 3), in place.
      await list.getByRole('link', { name: 'Design Systems Designer', exact: true }).click();
      await expect(page).toHaveURL(/#\/find\/.+/);
      await expect(
        page.getByRole('heading', { level: 1, name: 'Design Systems Designer' }),
      ).toBeVisible();
      // Its action row has the posting's own Open posting icon link (Adrian 2026-11-08).
      const detail = page.locator('section[aria-labelledby="rjb-posting-title"]');
      await expect(detail.getByRole('link', { name: /^Open posting for / })).toBeVisible();
      // #546: list cards carry no keys at 1440; the detail column has them, in the job's template.
      await expect(list.getByRole('button', { name: /^(Save|Skip) / })).toHaveCount(0);
      await expect(detail.getByText('Hacker News', { exact: true })).toBeVisible();
      postingTemplate = await templateOf(page);
      expect(postingTemplate).toMatchObject({ ordered: true, firstKey: 'primary' });
      // The selected card is a stronger fill, never a ring or edge (#603, #546).
      const selected = list.locator('.rjb-selected');
      await expect(selected).toHaveAttribute('aria-current', 'true');
      const unselected = list.locator('article:not(.rjb-selected)').first();
      expect(await selectionStyle(selected, unselected)).toEqual(FILL_ONLY);
      await page.screenshot({ path: `test-results/review-selected-${width}.png` });
      await expect(list).toBeVisible();
    } else {
      // Below lg there is no posting page (Adrian 2026-11-08): the compact card's title is the link
      // out to the posting (#544); no description row, no Open posting key.
      const card = list.getByRole('article').filter({ hasText: 'Design Systems Designer' }).first();
      const link = card.getByRole('heading', { level: 3 }).getByRole('link');
      await expect(link).toHaveAttribute('href', /^https:/);
      await expect(link).toHaveAttribute('target', '_blank');
      await expect(card.getByRole('button', { name: /description/ })).toHaveCount(0);
      await expect(card.getByRole('link', { name: /^Open posting for / })).toHaveCount(0);
      await expect(page).toHaveURL(/#\/find$/);
      await page.screenshot({ path: `test-results/review-selected-${width}.png` });
      await expect(page.getByRole('heading', { level: 1, name: 'Find' })).toBeVisible();
    }

    // Skip hides only that posting: Orbit's other one stays.
    await (await decideOn('Design Systems Engineer', 'Skip', 'Orbit')).click();
    await expect(list.getByRole('listitem')).toHaveCount(3);
    await expect(
      list.getByRole('heading', {
        name: /^Design Systems Designer\u2060?( \(opens in new tab\))?$/,
      }),
    ).toBeVisible();

    // Past the double-tap guard (answerGuard.ts), so the next decision is a new one.
    await page.waitForTimeout(800);
    // #534: Skip says so with Undo (no confirm), and Save is the filled key with a plus icon.
    await expect(
      page.getByRole('region', { name: /^Notifications/ }).getByRole('button', { name: 'Undo' }),
    ).toBeVisible();
    const save = await decideOn('Design Systems Lead', 'Save', 'Lumen');
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
    // The Deck keeps no selection (#546): Find's header shows again, with its "1 of N" caption.
    await expect(page).toHaveURL(/#\/find$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Find' })).toBeVisible();
    await expect(page.getByRole('article')).toHaveCount(1);
    // #557 cuts: no source or blue New badge on the Deck card; the company stays.
    const card = page.getByRole('article');
    await expect(card.getByText('Hacker News', { exact: true })).toHaveCount(0);
    await expect(card.getByText('New', { exact: true })).toHaveCount(0);
    await expect(card.locator('[data-tone="info"]')).toHaveCount(0);
    await expect(card.getByRole('heading', { level: 3 })).toBeVisible();
    // 2026-11-12: "‹ 1 of 2 ›" in the page bar (HDS compact pager, Previous off at the start).
    // #617: Sort is there in the Deck too, its own key beside Browse | Deck.
    const pager = page.getByRole('navigation', { name: 'Postings in the deck' });
    await expect(pager.getByText('1 of 2')).toBeVisible();
    await expect(pager.getByRole('button', { name: /previous/i })).toBeDisabled();
    // Find controls (2026-11-13): the pager sits at the right of the Find | Apply row.
    const navBox = await page.getByRole('navigation', { name: 'Sections' }).boundingBox();
    const pagerBox = await pager.boundingBox();
    expect(
      Math.abs(navBox!.y + navBox!.height / 2 - (pagerBox!.y + pagerBox!.height / 2)),
    ).toBeLessThan(4);
    expect(pagerBox!.x).toBeGreaterThan(navBox!.x + navBox!.width);
    await page.getByRole('button', { name: 'Sort: Newest' }).click();
    await expect(page.getByRole('menuitemradio', { name: 'Newest' })).toBeVisible();
    await page.keyboard.press('Escape');
    // More (Not this company) sits beside the card's title.
    const moreBox = await card.getByRole('button', { name: /^More actions/ }).boundingBox();
    const titleBox = await card.getByRole('heading', { level: 3 }).boundingBox();
    expect(Math.abs(moreBox!.y - titleBox!.y)).toBeLessThan(24);
    // Skip (grey) and Save (filled, right) sit in the dock: fixed at the bottom on a phone, one
    // row, each key 44px tall at least; inline under the card at lg.
    const dock = page.getByRole('group', { name: /^Actions for / });
    const skipKey = dock.getByRole('button', { name: /^Skip / });
    const saveKey = dock.getByRole('button', { name: /^Save / });
    const [skipBox, saveBox] = [await skipKey.boundingBox(), await saveKey.boundingBox()];
    expect(skipBox && saveBox && skipBox.x < saveBox.x).toBe(true);
    expect(Math.abs((skipBox?.y ?? 0) - (saveBox?.y ?? 1))).toBeLessThan(1);
    // In flow under the card at every width (2026-11-13): no fixed dock on Find, the card's width.
    expect(await dock.evaluate((el) => getComputedStyle(el).position)).not.toBe('fixed');
    const cardBox = (await page.locator('.rjb-deck article').boundingBox())!;
    expect(skipBox!.y).toBeGreaterThan(cardBox.y + cardBox.height - 1);
    expect(Math.abs(skipBox!.x - cardBox.x)).toBeLessThan(1);
    expect(Math.abs(saveBox!.x + saveBox!.width - (cardBox.x + cardBox.width))).toBeLessThan(1);
    if (width < 1024) expect(skipBox!.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: `test-results/review-deck-${width}.png`, fullPage: true });
    for (let left = 2; left > 0; left--) {
      // Past the double-tap guard again.
      await page.waitForTimeout(800);
      await page
        .getByRole('group', { name: /^Actions for / })
        .getByRole('button', { name: /^Skip / })
        .click();
      if (left > 1) {
        await expect(page.getByRole('article')).toHaveCount(1);
        await expect(page.getByText('1 of 1', { exact: true })).toBeVisible();
        // Focus goes to the next card's title, not the dock key (#545 follow-up).
        await expect(page.getByRole('article').getByRole('heading', { level: 3 })).toBeFocused();
      }
    }
    // The deck is empty: Find's h1 takes focus.
    await expect(page.getByRole('heading', { level: 1, name: 'Find' })).toBeFocused();
    await expect(page.getByText('You’re all caught up')).toBeVisible();

    // Back on the Pipeline, the save is in To apply.
    await page.goto('/#/apply');
    await expect(page.getByText('Design Systems Lead').first()).toBeVisible();
    if (postingTemplate) {
      // At 1440 the Apply tab opens on the saved job: the same template as the posting (#546).
      await expect(
        page.getByRole('heading', { level: 1, name: 'Design Systems Lead' }),
      ).toBeVisible();
      expect(await templateOf(page)).toEqual(postingTemplate);
    }
  });
}

// Find controls (2026-11-13): New (two-digit count) and Remote (no count) on the left, Browse | Deck,
// Sort and More pinned at the right, one row at 375 and 390. Each key's 44px hit area is its own (elementFromPoint).
for (const width of [375, 390]) {
  test(`the Review row: one line, the right group pinned, its own 44px hit areas (${width})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.route(/^https?:\/\/(?!localhost)/, (r) => {
      const url = r.request().url();
      const json = (body: unknown) =>
        r.fulfill({
          status: 200,
          headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
      if (!url.startsWith('https://hn.algolia.com/'))
        return url.startsWith('https://api.lever.co/') ? json([]) : json({ jobs: [] });
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
        hits: Array.from({ length: 12 }, (_, i) => ({
          objectID: `m-${i}`,
          story_id: 9,
          parent_id: 9,
          created_at: new Date().toISOString(),
          comment_text: `Co${i} | Design Systems Engineer | Remote<p>Own our design system.</p>`,
        })),
      });
    });
    await page.goto('/#/find');
    await expect(page.getByRole('button', { name: 'Browse' })).toBeVisible();
    const since = await page.evaluate(() => Date.now());
    await findMenuItem(page, 'Scan now');
    await scanFinished(page, since);
    const chips = page.getByRole('group', { name: 'Filter postings' });
    await expect(chips.getByRole('button', { name: /^New \d\d$/ })).toBeVisible();
    await expect(chips.getByRole('button', { name: 'Remote', exact: true })).toBeVisible();
    const sort = page.getByRole('button', { name: /^Sort: / });
    const more = page.getByRole('button', { name: 'More: scan and search profile' });
    const [c, s, m] = [
      await chips.boundingBox(),
      await sort.boundingBox(),
      await more.boundingBox(),
    ];
    expect(Math.abs(c!.y + c!.height / 2 - (s!.y + s!.height / 2))).toBeLessThan(4);
    expect(Math.abs(m!.y - s!.y)).toBeLessThan(1);
    expect(m!.x).toBeGreaterThan(s!.x);
    // More ends the row, inside the page gutter (20px).
    expect(m!.x + m!.width).toBeLessThanOrEqual(width - 20);
    // Each key's 44px hit area (.rjb-hit-44's ::after) is its own: a tap 2px inside each edge of it
    // lands on that key, never its neighbour.
    // A tap just inside the last chip's right edge is the chip's, not Browse's.
    const remote = chips.getByRole('button', { name: 'Remote', exact: true });
    const onChip = await remote.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return document.elementFromPoint(r.right - 2, r.top + r.height / 2)?.closest('button') === el;
    });
    expect(onChip).toBe(true);
    for (const name of ['Browse', 'Deck', /^Sort: /, 'More: scan and search profile']) {
      const hit = await hitArea(page.getByRole('button', { name }));
      expect(hit.width).toBeGreaterThanOrEqual(44);
      expect(hit.height).toBeGreaterThanOrEqual(44);
      expect(hit.misses, String(name)).toEqual([]);
    }
  });
}
