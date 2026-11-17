import { test, expect, type Page } from './fixtures';

// The whole Review card opens its posting on a phone (Adrian 2026-11-17): the title link stays the
// card's one link (screen readers hear one link per card), and its hit area is stretched over the
// card (`::after`). The card's own controls (Show more, Save, Skip, More) sit above that area and
// keep working, each a 44px target. The card takes HDS surface tokens on hover and press.
// Synthetic Greenhouse boards (no real people); every other host answers empty.
test.use({ signedIn: true });

const SHOTS = process.env.CARD_SHOTS;
const TITLE = 'Design Systems Engineer';
const NAME = /Design Systems Engineer at Norrow/;
const LONG_TEXT = `<p>${'Own the design system, its tokens and its components. '.repeat(12)}</p>`;

async function feed(page: Page) {
  await page.route(/^https?:\/\/(?!localhost)/, (r) => {
    const url = r.request().url();
    const json = (body: unknown) =>
      r.fulfill({
        status: 200,
        headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    // The posting itself (the new tab), a stub page.
    if (url.startsWith('https://example.com/jobs/'))
      return r.fulfill({ status: 200, contentType: 'text/html', body: '<title>Posting</title>' });
    if (url.startsWith('https://remotive.com/') || url.startsWith('https://jobicy.com/'))
      return json({ jobs: [] });
    if (url.startsWith('https://api.lever.co/')) return json([]);
    if (url.startsWith('https://api.ashbyhq.com/')) return json({ jobs: [] });
    if (url.startsWith('https://hn.algolia.com/')) return json({ hits: [] });
    if (!url.startsWith('https://boards-api.greenhouse.io/')) return r.abort();
    const at = new Date().toISOString();
    const job = (id: number, title: string, company: string) => ({
      id,
      title,
      company_name: company,
      absolute_url: `https://example.com/jobs/${id}`,
      location: { name: 'Remote, Europe' },
      first_published: at,
      updated_at: at,
      content: LONG_TEXT.replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    });
    return json({
      jobs: [job(1, 'Senior Design Systems Designer', 'Talva'), job(2, TITLE, 'Norrow')],
    });
  });
}

async function open(page: Page, scheme: 'light' | 'dark' = 'light') {
  await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
  await feed(page);
  await page.goto('/#/review');
  const card = page.getByRole('article', { name: NAME });
  await expect(card).toBeVisible({ timeout: 60_000 });
  await card.scrollIntoViewIfNeeded();
  return card;
}

test.describe('390', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('a tap anywhere on the card opens the posting; the card has one link', async ({ page }) => {
    const card = await open(page);
    await expect(card.getByRole('link')).toHaveCount(1);
    // A fact line, well away from the title.
    // The stretched area lies over the text, so the tap goes to a point, not to the text node.
    const at = (await card.getByText('Remote, Europe').boundingBox())!;
    // The new tab is its own page: the posting's stub answers there too.
    await page
      .context()
      .route('https://example.com/jobs/**', (r) =>
        r.fulfill({ status: 200, contentType: 'text/html', body: '<title>Posting</title>' }),
      );
    const popup = page.waitForEvent('popup');
    await page.touchscreen.tap(at.x + at.width / 2, at.y + at.height / 2);
    expect((await popup).url()).toBe('https://example.com/jobs/2');
  });

  test('the card’s own controls sit above it, keep working and are 44px targets', async ({
    page,
  }) => {
    const card = await open(page);
    let opened = 0;
    page.on('popup', () => opened++);
    for (const name of [/^Save /, /^Skip /, /^More /, 'Show more']) {
      const key = card.getByRole('button', { name }).first();
      await key.scrollIntoViewIfNeeded();
      const box = (await key.boundingBox())!;
      expect(box.height, String(name)).toBeGreaterThanOrEqual(44);
      // The middle of the key takes the tap: nothing (the stretched area) paints over it.
      const hit = await key.evaluate(
        (el, [x, y]) => document.elementFromPoint(x, y)?.closest('button') === el,
        [box.x + box.width / 2, box.y + box.height / 2],
      );
      expect(hit, String(name)).toBe(true);
    }
    await card.getByRole('button', { name: 'Show more' }).tap();
    await expect(card.getByRole('button', { name: 'Show less' })).toBeVisible();
    expect(opened).toBe(0);
    if (SHOTS) {
      for (const scheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: scheme });
        await page.screenshot({ path: `${SHOTS}/card-390-${scheme}.png` });
      }
      await page.emulateMedia({ colorScheme: 'light' });
    }
    await card.getByRole('button', { name: /^Save / }).tap();
    await expect(page.getByText(/^Added to Apply/).first()).toBeVisible();
    expect(opened).toBe(0);
  });
});

test.describe('390 with a pointer', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the card takes the HDS hover surface', async ({ page }) => {
    const card = await open(page);
    const fill = () => card.evaluate((el) => getComputedStyle(el).backgroundColor);
    const rest = await fill();
    const at = (await card.getByText('Remote, Europe').boundingBox())!;
    await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
    await expect.poll(fill).not.toBe(rest);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/card-390-hover.png` });
    await page.mouse.move(380, 830);
    await expect.poll(fill).toBe(rest);
  });
});

// One hangline at lg (Adrian 2026-11-17): the list column's first card and the detail's title
// block start at the same top, with no extra margin or line-height gap above the h1.
test.describe('1440', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  for (const scheme of ['light', 'dark'] as const) {
    test(`the first card and the detail h1 share one top (${scheme})`, async ({ page }) => {
      await open(page, scheme);
      await page.evaluate(() => window.scrollTo(0, 0));
      const h1 = page.locator('main [data-rjb-title-block] h1').first();
      await expect(h1).toBeVisible();
      const card = page.getByRole('list', { name: 'New postings' }).getByRole('article').first();
      const [c, h] = [(await card.boundingBox())!, (await h1.boundingBox())!];
      // The h1's ink box top: its line box less the half-leading above the cap height is the
      // type's own; the hangline is the h1's box top, with no margin or padding above it.
      expect(Math.abs(c.y - h.y)).toBeLessThanOrEqual(1);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/hangline-1440-${scheme}.png` });
    });
  }
});

// Bold in a posting's description (Adrian 2026-11-17: "Company:", "Work Mode:" read in another,
// condensed-looking face): <strong> and <b> take the body's family at the HDS bold weight.
test.describe('description bold', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('a bold run keeps the body family at the HDS bold weight', async ({ page }) => {
    const html =
      '<p><strong>Company:</strong> Norrow. <b>Work Mode:</b> Remote. Own the design system.</p>';
    await open(page);
    // After open()'s feed: the route added last answers first.
    await page.route(/boards-api\.greenhouse\.io\/v1\/boards\/[^/]+\/jobs\/\d+/, (r) =>
      r.fulfill({
        status: 200,
        headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
        body: JSON.stringify({ id: 2, content: html.replace(/</g, '&lt;').replace(/>/g, '&gt;') }),
      }),
    );
    await page.reload();
    const bold = page.locator('[data-rjb-description] strong').first();
    await expect(bold).toBeVisible();
    const m = await bold.evaluate(async (el) => {
      await document.fonts.ready;
      const p = getComputedStyle(el.parentElement!);
      const b = getComputedStyle(el);
      const token = getComputedStyle(document.documentElement)
        .getPropertyValue('--primitive-typography-weight-bold')
        .trim();
      // A face loaded for the run's weight: the browser draws it, not a synthesized fallback.
      const loaded = document.fonts.check(`${b.fontWeight} ${b.fontSize} ${b.fontFamily}`);
      return { fam: b.fontFamily, parentFam: p.fontFamily, weight: b.fontWeight, token, loaded };
    });
    expect(m.fam).toBe(m.parentFam);
    expect(m.weight).toBe(m.token);
    expect(m.loaded).toBe(true);
    if (SHOTS) {
      await bold.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${SHOTS}/desc-bold-1440.png` });
    }
  });
});
