import { test, expect, type Locator, type Page } from '@playwright/test';

// Adrian 2026-10-22: "Anywhere a job is listed, we should be able to click on the URL to visit the
// link, or there should be a visit jump link button near the URL or name of the job." With the
// sample pipeline loaded, every job the Pipeline lists (its panels, the table at 1440, the cards
// at 390), the job rail at 1440, every job page header, the closed-on-the-board list and Recently
// removed carry a one-tap link to that job's own posting, beside its title, opening a new tab; on a
// phone it is a 40px target. Every point of that target takes the tap (nothing paints over it),
// it covers no other control (so a tap never opens a neighbour's posting), and a long unbroken
// title wraps beside it instead of running under it or pushing it out of view (QA 2026-10-22).

type SavedJob = { url: string; label: string };

/** The saved jobs, as the store persists them (src/store.ts, `rjb_shortlist`). */
const savedJobs = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('rjb_shortlist') || '[]') as SavedJob[]);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const postingFor = (scope: Locator, title: string) =>
  scope.getByRole('link', { name: new RegExp(`^Open posting for ${escape(title)}( at |$)`) });

async function loadSample(page: Page) {
  // Nothing leaves the machine: the sample postings answer with a stub page.
  await page
    .context()
    .route(/^https?:\/\/(?!localhost)/, (r) =>
      r.fulfill({ status: 200, contentType: 'text/html', body: '<title>Posting</title>' }),
    );
  await page.goto('/#/queue');
  await page.getByRole('button', { name: 'Try with sample data' }).click();
  await expect(page.getByRole('region', { name: /^Jobs/ })).toBeVisible();
}

/** A title with a long unbroken run (QA 2026-10-22): it has to wrap beside the posting link. */
const LONG = 'Lead Designer, Design-Systems/Platform/Tokens/Components/Accessibility';
const BOARD = [101, 102, 103].map((n) => `https://boards.greenhouse.io/acme/jobs/${n}`);
const REMOVED = [1, 2, 3].map((n) => `https://jobs.lever.co/acme/removed-${n}`);

/** The sample data, plus three Greenhouse jobs their board no longer lists (the closed-on-the-board
 *  list) and three removed jobs (Recently removed). With `long`, the first sample job, the first
 *  board job and the newest removed job carry LONG as their title. */
async function loadBusy(page: Page, { long = false } = {}) {
  await loadSample(page);
  // The board answers with no openings, so all three read as closed.
  await page.route(/boards-api\.greenhouse\.io/, (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ jobs: [], meta: { total: 0 } }),
    }),
  );
  await page.evaluate(
    ({ board, removed, long, title }) => {
      const jobs = JSON.parse(localStorage.getItem('rjb_shortlist') || '[]');
      if (long) jobs[0].label = title;
      const extra = board.map((url, i) => ({
        url,
        label: long && i === 0 ? title : `Board role ${i + 1}`,
        company: 'Acme',
        status: 'Saved',
      }));
      localStorage.setItem('rjb_shortlist', JSON.stringify([...jobs, ...extra]));
      const now = Date.now();
      const trash = removed.map((url, i) => ({
        job: {
          url,
          label: long && i === 0 ? title : `Removed role ${i + 1}`,
          company: 'Acme',
          status: 'Saved',
        },
        removedAt: new Date(now - i * 60_000).toISOString(),
      }));
      localStorage.setItem('rjb_trash', JSON.stringify(trash));
    },
    { board: BOARD, removed: REMOVED, long, title: LONG },
  );
  await page.reload();
  await expect(page.getByRole('region', { name: /^Jobs/ })).toBeVisible();
  await page.getByRole('button', { name: 'Check which are still open' }).click();
  await expect(
    page.getByRole('list', { name: 'Closed on the board' }).getByRole('listitem'),
  ).toHaveCount(3);
}

/**
 * Every posting link under `root`, hit-tested in the page: each whole pixel of its target (three
 * columns, every pixel down, inside its rounded corners and a 1px edge where sub-pixel rounding
 * decides) must land on the link itself, and its box may overlap no other control. Returns one
 * line per offence.
 */
function targetOffences(root: Locator) {
  return root.evaluate((rootEl) => {
    const out: string[] = [];
    const name = (el: Element) =>
      (el.getAttribute('aria-label') || el.textContent || '')
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, 48);
    const shown = (el: Element) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 1 && r.height > 1 && cs.visibility !== 'hidden' && cs.display !== 'none';
    };
    const layer = (el: Element) => el.closest('[role="dialog"], [role="alertdialog"]');
    const links = [...rootEl.querySelectorAll('a[aria-label^="Open posting"]')].filter(shown);
    const controls = [
      ...document.querySelectorAll('a[href], button, input, select, textarea, [role="button"]'),
    ].filter(shown);
    if (links.length === 0) out.push('no posting links');
    for (const a of links) {
      a.scrollIntoView({ block: 'center' });
      const r = a.getBoundingClientRect();
      const rad = parseFloat(getComputedStyle(a).borderTopLeftRadius) || 0;
      // Inside the rounded box (a corner outside its curve is not the link's, by design).
      const inside = (x: number, y: number) => {
        const cx = Math.min(Math.max(x, r.left + rad), r.right - rad);
        const cy = Math.min(Math.max(y, r.top + rad), r.bottom - rad);
        return Math.hypot(x - cx, y - cy) <= rad - 1;
      };
      const takers = new Map<string, number>();
      for (const fx of [0.3, 0.5, 0.7])
        for (let y = Math.ceil(r.top) + 1; y <= Math.floor(r.bottom) - 1; y++) {
          const x = Math.round(r.left + r.width * fx);
          if (!inside(x, y)) continue;
          const hit = document.elementFromPoint(x, y);
          if (hit && (hit === a || a.contains(hit))) continue;
          const k = hit
            ? `${hit.tagName.toLowerCase()}[${name(hit.closest('a, button') ?? hit)}]`
            : 'nothing';
          takers.set(k, (takers.get(k) ?? 0) + 1);
        }
      for (const [k, n] of takers) out.push(`${name(a)}: ${n} points go to ${k}`);
      for (const c of controls) {
        if (c === a || c.contains(a) || a.contains(c)) continue;
        // A dialog's links sit over the page behind it: only its own controls count.
        if (layer(c) !== layer(a)) continue;
        const q = c.getBoundingClientRect();
        const w = Math.min(r.right, q.right) - Math.max(r.left, q.left);
        const h = Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top);
        if (w > 0.5 && h > 0.5)
          out.push(
            `${name(a)} overlaps ${c.tagName.toLowerCase()}[${name(c)}] by ${w.toFixed(1)}x${h.toFixed(1)}`,
          );
      }
    }
    return out;
  });
}

/**
 * Every posting link under `root` sits inside each box that clips or scrolls it (a dialog, the
 * viewport) and over none of the LONG title's text. Returns one line per offence.
 */
function longTitleOffences(root: Locator) {
  return root.evaluate((rootEl, long) => {
    const out: string[] = [];
    const links = [...rootEl.querySelectorAll('a[aria-label^="Open posting"]')];
    if (!links.some((a) => a.getAttribute('aria-label')!.includes(long)))
      out.push('no posting link for the long title');
    const text: DOMRect[] = [];
    const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode())
      if (n.textContent?.includes(long)) {
        const range = document.createRange();
        range.selectNodeContents(n);
        text.push(...range.getClientRects());
      }
    if (text.length === 0) out.push('the long title is not shown');
    for (const a of links) {
      a.scrollIntoView({ block: 'center' });
      const b = a.getBoundingClientRect();
      const what = a.getAttribute('aria-label')!.slice(0, 40);
      if (b.left < -0.5 || b.right > document.documentElement.clientWidth + 0.5)
        out.push(`${what}: outside the viewport (${Math.round(b.left)}–${Math.round(b.right)})`);
      for (let p = a.parentElement; p; p = p.parentElement) {
        if (!/(auto|scroll|hidden|clip)/.test(getComputedStyle(p).overflowX)) continue;
        const q = p.getBoundingClientRect();
        if (b.left < q.left - 0.5 || b.right > q.right + 0.5)
          out.push(
            `${what}: outside its ${p.tagName.toLowerCase()} (${Math.round(b.left)}–${Math.round(b.right)} of ${Math.round(q.left)}–${Math.round(q.right)})`,
          );
        if (p.scrollWidth > p.clientWidth + 1)
          out.push(
            `${p.tagName.toLowerCase()} scrolls sideways (${p.scrollWidth} > ${p.clientWidth})`,
          );
      }
      for (const t of text) {
        const w = Math.min(b.right, t.right) - Math.max(b.left, t.left);
        const h = Math.min(b.bottom, t.bottom) - Math.max(b.top, t.top);
        if (w > 0.5 && h > 0.5)
          out.push(`${what}: over the title text by ${w.toFixed(1)}x${h.toFixed(1)}`);
      }
    }
    return [...new Set(out)];
  }, LONG);
}

/** Open the job page of the first listed job whose title contains `text`. */
async function openJobTitled(page: Page, text: string) {
  const hash = await page
    .getByRole('region', { name: /^Jobs/ })
    .locator('a[href^="#/queue/"]', { hasText: text })
    .first()
    .getAttribute('href');
  await page.evaluate((h) => (location.hash = h!), hash);
  await expect(page.locator('header h1')).toContainText(text);
}

/** Each listed job's title link (to its page) sits beside a posting link to its own URL. */
async function expectPostingLinks(page: Page, rows: Locator, phone: boolean) {
  const jobs = await savedJobs(page);
  const count = await rows.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    const row = rows.nth(i);
    const title = (await row.locator('a[href^="#/queue/"]').first().textContent())!.trim();
    const job = jobs.find((j) => j.label === title);
    expect(job, `a saved job titled "${title}"`).toBeTruthy();
    const posting = postingFor(row, title);
    await expect(posting).toBeVisible();
    await expect(posting).toHaveAttribute('href', job!.url);
    await expect(posting).toHaveAttribute('target', '_blank');
    if (phone) {
      const box = (await posting.boundingBox())!;
      expect(box.width, `${title}: 40px wide`).toBeGreaterThanOrEqual(39.5);
      expect(box.height, `${title}: 40px tall`).toBeGreaterThanOrEqual(39.5);
    }
  }
}

for (const width of [390, 1440] as const) {
  test.describe(`posting links at ${width}`, () => {
    test.use({ viewport: { width, height: 900 } });
    const phone = width < 640;

    test('every job the Pipeline lists opens its posting in one tap', async ({ page }) => {
      await loadSample(page);
      // The Jobs panel: job cards at every width (Adrian 2026-10-24).
      const jobRows = page.getByRole('region', { name: /^Jobs/ }).getByRole('article');
      await expectPostingLinks(page, jobRows, phone);
      // The agenda panels above it.
      await expectPostingLinks(
        page,
        page.getByRole('region', { name: /^Follow up \(/ }).getByRole('listitem'),
        phone,
      );
      // An event row's title is plain text ("Interview · <job>"); its posting link sits beside it.
      const jobs = await savedJobs(page);
      const events = page.getByRole('region', { name: /^Next 7 days/ }).getByRole('listitem');
      expect(await events.count()).toBeGreaterThan(0);
      for (const event of await events.all()) {
        const posting = event.getByRole('link', { name: /^Open posting for / });
        expect(jobs.map((j) => j.url)).toContain(await posting.getAttribute('href'));
      }
    });

    test('every job page header opens its posting; the link opens a new tab', async ({ page }) => {
      await loadSample(page);
      const jobs = await savedJobs(page);
      const pages = await page
        .getByRole('region', { name: /^Jobs/ })
        .locator('a[href^="#/queue/"]')
        .evaluateAll((as) => as.map((a) => [a.getAttribute('href')!, a.textContent!.trim()]));
      expect(pages.length).toBeGreaterThan(0);
      let header: Locator | null = null;
      for (const [hash, title] of pages) {
        await page.evaluate((h) => (location.hash = h), hash);
        const heading = page.getByRole('heading', { level: 1, name: title, exact: true });
        await expect(heading).toBeVisible();
        header = page.locator('header').filter({ has: heading });
        const job = jobs.find((j) => j.label === title)!;
        const posting = postingFor(header, title);
        await expect(posting).toHaveAttribute('href', job.url);
        if (phone) {
          const box = (await posting.boundingBox())!;
          expect(Math.min(box.width, box.height), `${title}: 40px`).toBeGreaterThanOrEqual(39.5);
        }
      }
      // One tap: a new tab on the posting, and the app stays on the job's page.
      const posting = header!.getByRole('link', { name: /^Open posting for / });
      const href = (await posting.getAttribute('href'))!;
      const [tab] = await Promise.all([page.context().waitForEvent('page'), posting.click()]);
      await tab.waitForLoadState();
      expect(tab.url()).toBe(href);
      expect(page.url()).toContain('#/queue/');
    });

    test('every posting link takes the tap across its whole target and covers no other control', async ({
      page,
    }) => {
      await loadBusy(page);
      // The Pipeline: the closed-on-the-board list, the agenda, the table or the cards.
      expect(await targetOffences(page.locator('#root'))).toEqual([]);
      // A job page: its header (and the rail beside it at 1440).
      await openJobTitled(page, 'Board role 1');
      expect(await targetOffences(page.locator('#root'))).toEqual([]);
      // A company page's jobs.
      await page.evaluate(() => (location.hash = '#/company/acme'));
      await expect(page.getByRole('region', { name: 'Jobs' })).toBeVisible();
      expect(await targetOffences(page.locator('#root'))).toEqual([]);
      // Recently removed.
      await page.evaluate(() => (location.hash = '#/queue'));
      // In the Account menu since #416.
      await page.getByRole('button', { name: /^Account/ }).click();
      await page.getByRole('menuitem', { name: 'Recently removed (3)' }).click();
      const dialog = page.getByRole('dialog', { name: 'Recently removed' });
      await expect(dialog.getByRole('link', { name: /^Open posting for / })).toHaveCount(3);
      expect(await targetOffences(dialog)).toEqual([]);
    });

    test('a long unbroken title wraps beside its posting link, never under it or off screen', async ({
      page,
    }) => {
      await loadBusy(page, { long: true });
      expect(
        await longTitleOffences(page.getByRole('list', { name: 'Closed on the board' })),
      ).toEqual([]);
      expect(await longTitleOffences(page.getByRole('region', { name: /^Jobs/ }))).toEqual([]);
      await openJobTitled(page, LONG.slice(0, 20));
      expect(await longTitleOffences(page.getByRole('main').locator('header'))).toEqual([]);
      if (!phone)
        expect(await longTitleOffences(page.getByRole('navigation', { name: 'Jobs' }))).toEqual([]);
      await page.evaluate(() => (location.hash = '#/queue'));
      // In the Account menu since #416.
      await page.getByRole('button', { name: /^Account/ }).click();
      await page.getByRole('menuitem', { name: 'Recently removed (3)' }).click();
      const dialog = page.getByRole('dialog', { name: 'Recently removed' });
      await expect(dialog.getByRole('link', { name: /^Open posting for / })).toHaveCount(3);
      expect(await longTitleOffences(dialog)).toEqual([]);
    });
  });
}

// Company logos come from a third-party icon host; tests never reach it (letters show).
test.beforeEach(async ({ context }) => {
  await context.route('https://icons.duckduckgo.com/**', (r) => r.abort());
});

test.describe('the job rail at 1440', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('every job the rail lists opens its own posting in one tap, beside its row', async ({
    page,
  }) => {
    await loadSample(page);
    const jobs = await savedJobs(page);
    await page.locator('a[href^="#/queue/"]').first().click();
    const rail = page.getByRole('navigation', { name: 'Jobs' });
    const rows = rail.getByRole('listitem');
    await expect(rows.nth(1)).toBeVisible();
    for (const row of await rows.all()) {
      const link = row.locator('a[href^="#/queue/"]');
      await expect(link).toHaveCount(1);
      const posting = row.getByRole('link', { name: /^Open posting for / });
      await expect(posting).toBeVisible();
      // Its own job's posting: the saved job at that URL is the one this row names.
      const href = await posting.getAttribute('href');
      const own = jobs.find((j) => j.url === href);
      expect(own, `a saved job at ${href}`).toBeTruthy();
      await expect(link).toContainText(own!.label);
      await expect(posting).toHaveAttribute('target', '_blank');
      // A sibling of the row's link, never inside it.
      expect(await link.locator('a[aria-label^="Open posting"]').count()).toBe(0);
    }
    expect(await targetOffences(rail)).toEqual([]);
  });
});
