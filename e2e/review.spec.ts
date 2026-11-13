import { test, expect, type Page } from '@playwright/test';
import { accountMenuItem, openScanDetails } from './routes';
import { FILL_ONLY, selectionStyle } from './selectedFill';

// Review new (simplify 5/9, #386) end to end on Today, at phone and desktop width: Browse lists every
// undecided posting with "N new today from M sources", Skip hides only that posting (its company's
// other posting stays), Save lands in the Pipeline's To apply; at 390 the pager steps a current
// card, at 1440 ↑ / ↓ move the selection (list only, no Deck since 2026-11-13). The feed is synthetic Hacker News posts (no real people); every other host answers empty.
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

    // Two left. Past the double-tap guard first.
    await page.waitForTimeout(800);
    await expect(page.getByRole('button', { name: /^View: / })).toHaveCount(0);
    await expect(page.getByRole('checkbox')).toHaveCount(0);
    const pager = page.getByRole('group', { name: 'Postings in the list' });
    if (wide) {
      // No pager at lg; ↑ / ↓ move the selection (never from a text field).
      await expect(pager).toHaveCount(0);
      const names = await list.getByRole('heading', { level: 3 }).allInnerTexts();
      await list.getByRole('link', { name: names[0], exact: true }).click();
      await page.keyboard.press('ArrowDown');
      await expect(page.getByRole('heading', { level: 1, name: names[1] })).toBeVisible();
      await page.keyboard.press('ArrowUp');
      await expect(page.getByRole('heading', { level: 1, name: names[0] })).toBeVisible();
    } else {
      // "‹ › 1 of 2": the arrows step a current card. Focus stays on the pager (review of #714), so
      // an arrow can be pressed again; at the end the arrow that turns off hands focus to the other.
      await expect(pager.getByText('1 of 2', { exact: true })).toBeVisible();
      await pager.getByRole('button', { name: 'Next posting' }).focus();
      await page.keyboard.press('Enter');
      await expect(pager.getByText('2 of 2', { exact: true })).toBeVisible();
      await expect(pager.getByRole('button', { name: 'Next posting' })).toBeDisabled();
      await expect(pager.getByRole('button', { name: 'Previous posting' })).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(pager.getByText('1 of 2', { exact: true })).toBeVisible();
      await expect(pager.getByRole('button', { name: 'Next posting' })).toBeFocused();
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
      await expect(page.getByRole('heading', { level: 1, name: 'Find' })).toBeFocused();
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

// The phone pager (Adrian 2026-11-13): "[‹][›] 1 of N" alone on the row, each arrow a 44px hit area
// of its own; the arrows step a current card into view, and scrolling moves the current card too.
for (const width of [375, 390]) {
  test(`the pager row: arrows then the count, 44px each, stepping and following the scroll (${width})`, async ({
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
    const list = page.getByRole('list', { name: 'New postings' });
    await expect(page.getByRole('region', { name: 'New postings' })).toBeVisible();
    const since = await page.evaluate(() => Date.now());
    await accountMenuItem(page, 'Scan now');
    await scanFinished(page, since);
    await expect(list.getByRole('listitem')).toHaveCount(12);
    const pager = page.getByRole('group', { name: 'Postings in the list' });
    const prev = pager.getByRole('button', { name: 'Previous posting' });
    const next = pager.getByRole('button', { name: 'Next posting' });
    const count = pager.getByText(/^\d+ of 12$/);
    await expect(count).toHaveText('1 of 12');
    // The arrows step the current card into view; focus stays on the arrow (review of #714), so a
    // second press needs no hunting for it.
    await next.click();
    await expect(next).toBeFocused();
    await next.click();
    await expect(count).toHaveText('3 of 12');
    const third = list.getByRole('listitem').nth(2);
    await expect(next).toBeFocused();
    // The card sits just under the pager row, which stays stuck at the top (2026-11-13).
    const [cardTop, bar] = [(await third.boundingBox())!.y, (await pager.boundingBox())!];
    expect(Math.abs(bar.y)).toBeLessThan(1);
    expect(cardTop).toBeGreaterThanOrEqual(bar.y + bar.height - 1);
    expect(cardTop).toBeLessThan(bar.y + bar.height + 24);
    // With both arrows enabled (one step in): arrows first, then the count; the row starts at the gutter. Each arrow is a 44px box, the
    // boxes do not overlap, and a tap anywhere in one is its own (viewport coordinates throughout).
    const geo = await pager.evaluate((g) => {
      const [p, n] = Array.from(g.querySelectorAll('button')).map((b) => b.getBoundingClientRect());
      const c = (g.querySelector('span') as HTMLElement).getBoundingClientRect();
      const misses: string[] = [];
      for (const [i, r] of [p, n].entries())
        // Each edge's middle 2px in, the centre, and the corners 8px in (the key's rounded corners
        // are not hit-tested as part of it).
        for (const [x, y] of [
          [r.left + 2, r.top + r.height / 2],
          [r.right - 2, r.top + r.height / 2],
          [r.left + r.width / 2, r.top + 2],
          [r.left + r.width / 2, r.bottom - 2],
          [r.left + r.width / 2, r.top + r.height / 2],
          [r.left + 8, r.top + 8],
          [r.right - 8, r.top + 8],
          [r.left + 8, r.bottom - 8],
          [r.right - 8, r.bottom - 8],
        ])
          if (
            document.elementFromPoint(x, y)?.closest('button') !== g.querySelectorAll('button')[i]
          )
            misses.push(`${i}: ${Math.round(x)},${Math.round(y)}`);
      return { p: p.toJSON(), n: n.toJSON(), c: c.toJSON(), misses };
    });
    expect(geo.misses).toEqual([]);
    expect(geo.p.right).toBeLessThanOrEqual(geo.n.left);
    expect(geo.n.right).toBeLessThanOrEqual(geo.c.left);
    expect(Math.abs(geo.p.left - 20)).toBeLessThan(2);
    for (const b of [geo.p, geo.n]) {
      expect(Math.round(b.width)).toBeGreaterThanOrEqual(44);
      expect(Math.round(b.height)).toBeGreaterThanOrEqual(44);
    }
    // Scrolling moves the current card with it, so the count stays true.
    await page.waitForTimeout(700);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(count).toHaveText('1 of 12');
    const sixth = list.getByRole('listitem').nth(5);
    await sixth.evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await expect(count).toHaveText('6 of 12');
    await expect(prev).toBeEnabled();
  });
}
