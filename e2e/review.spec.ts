import { test, expect, type Page } from './fixtures';
import { accountMenuItem, openScanDetails } from './routes';
import { FILL_ONLY, selectionStyle } from './selectedFill';

// Review new (simplify 5/9, #386) end to end on Today, at phone and desktop width: Browse lists every
// undecided posting with "N new today from M sources", Skip hides only that posting (its company's
// other posting stays), Save lands in the Pipeline's To apply; at 390 the list scrolls with no
// pager (2026-11-14), at 1440 ↑ / ↓ move the selection (list only, no Deck since 2026-11-13). The feed is synthetic Hacker News posts (no real people); every other host answers empty.
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
  await page.goto('/#/review');
  // A first visit gets the design-systems Search profile on its own (no setup screen).
  await expect(page).toHaveURL(/#\/review$/);
  await expect(page.getByRole('heading', { name: 'New postings' })).toBeVisible();
  // The profile has landed (the list shows), so the page no longer swaps under the click. Signed
  // out, nothing scans on open (2026-11-07): Scan now does.
  await expect(page.getByRole('region', { name: 'New postings' })).toBeVisible();
  const since = await page.evaluate(() => Date.now());
  // Scan now is the Account menu's (#694).
  await accountMenuItem(page, 'Scan now');
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
  test(`browse, skip one posting, save one, then walk and finish the list (${width})`, async ({
    page,
  }) => {
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
    // No status text above the list (Adrian 2026-11-08): no scan line, counts or progress.
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
      await expect(page).toHaveURL(/#\/review\/.+/);
      const first = await list.getByRole('heading', { level: 3 }).first().innerText();
      await expect(page.getByRole('heading', { level: 1, name: first })).toBeVisible();
      await expect(page.getByText('Pick a posting')).toHaveCount(0);
      // A title selects another posting for the detail column (#471 slice 3), in place.
      await list.getByRole('link', { name: 'Design Systems Designer', exact: true }).click();
      await expect(page).toHaveURL(/#\/review\/.+/);
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
      await expect(page).toHaveURL(/#\/review$/);
      await page.screenshot({ path: `test-results/review-selected-${width}.png` });
      await expect(page.getByRole('heading', { level: 1, name: 'Review' })).toBeVisible();
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

    // Two left. Past the double-tap guard first.
    await page.waitForTimeout(800);
    await expect(page.getByRole('button', { name: /^View: / })).toHaveCount(0);
    await expect(page.getByRole('checkbox')).toHaveCount(0);
    // No pager at any width (Adrian 2026-11-14: in a scrolled list its arrows only jumped the page).
    await expect(page.getByRole('group', { name: 'Postings in the list' })).toHaveCount(0);
    if (wide) {
      // ↑ / ↓ move the selection (never from a text field).
      const names = await list.getByRole('heading', { level: 3 }).allInnerTexts();
      await list.getByRole('link', { name: names[0], exact: true }).click();
      await page.keyboard.press('ArrowDown');
      await expect(page.getByRole('heading', { level: 1, name: names[1] })).toBeVisible();
      await page.keyboard.press('ArrowUp');
      await expect(page.getByRole('heading', { level: 1, name: names[0] })).toBeVisible();
    }
    for (let left = 2; left > 0; left--) {
      await page.waitForTimeout(800);
      // The first card's name is "<title> at <company>".
      const name = (await list.getByRole('article').first().getAttribute('aria-label'))!;
      const [title, company] = name.split(' at ');
      await (await decideOn(title, 'Skip', company)).click();
      if (left > 1) await expect(list.getByRole('listitem')).toHaveCount(1);
    }
    await expect(page.getByText('You’re all caught up')).toBeVisible();
    if (wide) {
      // The two columns stay: caught up is the right column's (2026-11-13).
      await expect(
        page.locator('.rjb-find-detail').getByText('You’re all caught up'),
      ).toBeVisible();
      await expect(page.getByRole('heading', { level: 1, name: 'Review' })).toBeFocused();
    } else {
      // Below lg the empty state's title takes the focus the last card left (#508).
      await expect(page.locator('#rjb-review-empty-title')).toBeFocused();
    }

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

// No phone pager (Adrian 2026-11-14): with postings to review, the list starts right under the tabs and
// scrolls; no "[‹][›] 1 of N" row, which in a scrolled list only jumped the page.
for (const width of [375, 390]) {
  test(`no pager above the scrolled list (${width})`, async ({ page }) => {
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
    await page.goto('/#/review');
    const list = page.getByRole('list', { name: 'New postings' });
    await expect(page.getByRole('region', { name: 'New postings' })).toBeVisible();
    const since = await page.evaluate(() => Date.now());
    await accountMenuItem(page, 'Scan now');
    await scanFinished(page, since);
    await expect(list.getByRole('listitem')).toHaveCount(12);
    await expect(page.getByRole('group', { name: 'Postings in the list' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^(Previous|Next) posting$/ })).toHaveCount(0);
    await expect(page.getByText(/^\d+ of 12$/)).toHaveCount(0);
    // The first card sits right under the page bar: no row above it.
    const nav = (await page.getByRole('navigation', { name: 'Sections' }).boundingBox())!;
    const first = (await list.getByRole('listitem').first().boundingBox())!;
    expect(first.y).toBeGreaterThan(nav.y + nav.height - 1);
    expect(first.y).toBeLessThan(nav.y + nav.height + 48);
    await page.screenshot({ path: `test-results/review-no-pager-${width}.png` });
  });
}

// Late postings wait (Adrian 2026-11-15): a posting that arrives after the person has started
// reading is not put in above the cards on screen; "1 new posting" shows it and goes to the top.
// A second Scan now reads one more HN post (synthetic: no real people).
for (const width of [390, 1440]) {
  test(`a late posting waits behind "N new postings" (${width})`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 900 });
    let extra = false;
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
      // Enough cards for the page to scroll at 1440 too (lg list cards are short, 2026-11-15).
      const hits = Array.from({ length: 14 }, (_, i) => ({
        objectID: `m-${i}`,
        story_id: 9,
        parent_id: 9,
        created_at: new Date(Date.now() - (i + 1) * 864e5).toISOString(),
        comment_text: `Co${i} | Design Systems Engineer | Remote<p>Own our design system.</p>`,
      }));
      if (extra)
        hits.unshift({
          objectID: 'm-new',
          story_id: 9,
          parent_id: 9,
          created_at: new Date().toISOString(),
          comment_text: 'Latecomer | Principal Design Systems Engineer | Remote<p>Lead it.</p>',
        });
      return json({ hits });
    });
    await page.goto('/#/review');
    const list = page.getByRole('list', { name: 'New postings' });
    await expect(page.getByRole('region', { name: 'New postings' })).toBeVisible();
    let since = await page.evaluate(() => Date.now());
    await accountMenuItem(page, 'Scan now');
    await scanFinished(page, since);
    await expect(list.getByRole('listitem')).toHaveCount(14);
    // The person reads on; then a later read finds one more posting.
    await page.mouse.move(width / 2, 500);
    await page.mouse.wheel(0, 100);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    const first = list.getByRole('article').first();
    const name = await first.getAttribute('aria-label');
    // Where the first card sits in the page (the Account menu may move the scroll).
    const top = () => first.evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
    const before = await top();
    extra = true;
    since = await page.evaluate(() => Date.now());
    await accountMenuItem(page, 'Scan now');
    await scanFinished(page, since);
    const key = page.getByRole('button', { name: '1 new posting' });
    await expect(key).toBeVisible({ timeout: 30_000 });
    // Nothing moved under the reader, and the late posting is not in the list yet.
    await expect(list.getByRole('listitem')).toHaveCount(14);
    await expect(list.getByRole('article').first()).toHaveAttribute('aria-label', name!);
    expect(Math.abs((await top()) - before)).toBeLessThan(1);
    // The key floats over the list: it takes no height.
    expect(await key.evaluate((b) => b.parentElement!.getBoundingClientRect().height)).toBe(0);
    const selected = width >= 1024 ? page.url() : null;
    await key.click();
    await expect(key).toHaveCount(0);
    await expect(list.getByRole('listitem')).toHaveCount(15);
    await expect(list.getByRole('article').first()).toHaveAttribute(
      'aria-label',
      'Principal Design Systems Engineer at Latecomer',
    );
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    // At lg the selected posting stays selected.
    if (selected) expect(page.url()).toBe(selected);
  });
}
