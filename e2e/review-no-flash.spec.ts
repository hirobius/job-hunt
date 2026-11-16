import { test, expect, type Page } from '@playwright/test';

// Review never flashes its empty state while it loads (Adrian 2026-11-15, a phone recording of the
// live app: the cached list, then "No postings match yet" for 1-2 s, then the new list; again after
// sign-in, and the Review count blanked). A recorder notes every DOM change from the first script
// on: the empty state must never show, the list must never drop to no cards once it had some, and
// the count must never go blank once shown, while the boards answer late (2.5 s). Signed out and
// signed in (Supabase faked at the network: a stored session, an empty cloud copy, no server rows),
// at 390. Synthetic Greenhouse boards (no real people); every other host answers empty.
const PROJECT = 'nelrcmbkimjjmfmgnixj';
const USER = { id: '00000000-0000-4000-8000-000000000002', email: 'flash@example.test' }; // pii-allow: fake test address
const DELAY = 800;

interface Frame {
  t: number;
  empty: boolean;
  cards: number;
  count: string | null;
}

async function feed(page: Page, delay: number, gate: { open: Promise<void> }) {
  await page.route(/^https?:\/\/(?!localhost|nelrcmbkimjjmfmgnixj)/, async (r) => {
    const url = r.request().url();
    const json = (body: unknown) =>
      r.fulfill({
        status: 200,
        headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    if (url.startsWith('https://remotive.com/') || url.startsWith('https://jobicy.com/'))
      return json({ jobs: [] });
    if (url.startsWith('https://api.lever.co/')) return json([]);
    if (url.startsWith('https://api.ashbyhq.com/')) return json({ jobs: [] });
    if (url.startsWith('https://hn.algolia.com/')) return json({ hits: [] });
    if (!url.startsWith('https://boards-api.greenhouse.io/')) return r.abort();
    // The board lists answer late; a posting's own text answers at once.
    if (!/\/jobs\/\d+/.test(url)) {
      await gate.open;
      await new Promise((res) => setTimeout(res, delay));
    }
    const at = new Date().toISOString();
    const job = (id: number, title: string, company: string) => ({
      id,
      title,
      company_name: company,
      absolute_url: `https://example.com/jobs/${id}`,
      location: { name: 'Remote' },
      first_published: at,
      updated_at: at,
      content: '&lt;p&gt;Own the design system and its tokens.&lt;/p&gt;',
    });
    return json({
      jobs: [
        job(1, 'Design Systems Engineer', 'Norrow'),
        job(2, 'Senior Design Systems Designer', 'Talva'),
        job(3, 'Design Systems Lead', 'Orbel'),
      ],
    });
  });
}

async function fakeSupabase(page: Page) {
  await page.route(`https://${PROJECT}.supabase.co/**`, (route) => {
    const url = route.request().url();
    if (url.includes('/auth/v1/user')) return route.fulfill({ json: USER });
    // No cloud copy, no server rows (the browser reads the boards), no picks.
    return route.fulfill({ json: [] });
  });
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = `${b64({ alg: 'HS256' })}.${b64({ sub: USER.id, email: USER.email, exp })}.sig`;
  await page.addInitScript(
    ([key, session]) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, session);
    },
    [
      `sb-${PROJECT}-auth-token`,
      JSON.stringify({
        access_token: token,
        refresh_token: 'r',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: exp,
        user: { ...USER, aud: 'authenticated', role: 'authenticated' },
      }),
    ] as const,
  );
}

/** Notes the page's state on every DOM change, from the first script on. */
async function record(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __frames: unknown[] };
    w.__frames = [];
    const note = () => {
      const count = document.querySelector('.rjb-seg-count');
      w.__frames.push({
        t: Math.round(performance.now()),
        empty: !!document.querySelector('[data-empty-cause]'),
        cards: document.querySelectorAll('article[aria-label]').length,
        count: count ? (count.textContent ?? '').trim() : null,
      });
    };
    new MutationObserver(note).observe(document, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
    });
  });
}

const frames = (page: Page) =>
  page.evaluate(() => (window as unknown as { __frames: Frame[] }).__frames);

/** No empty state ever; once the list had cards it never drops to none; once the count showed it
 *  never goes blank or 0. */
function expectSteady(all: Frame[]) {
  expect(all.filter((f) => f.empty)).toEqual([]);
  const firstCards = all.findIndex((f) => f.cards > 0);
  if (firstCards >= 0) expect(all.slice(firstCards).filter((f) => f.cards === 0)).toEqual([]);
  const firstCount = all.findIndex((f) => f.count);
  if (firstCount >= 0)
    expect(all.slice(firstCount).filter((f) => !f.count || f.count === '0')).toEqual([]);
}

const lastReadAt = (page: Page) =>
  page.evaluate(() => {
    try {
      return (JSON.parse(localStorage.getItem('rjb_feed_last') ?? 'null') as { at?: number } | null)
        ?.at;
    } catch {
      return undefined;
    }
  });

async function settle(page: Page, before?: number) {
  await expect(page.getByRole('article', { name: /Design Systems Lead at Orbel/ })).toBeVisible({
    timeout: 30_000,
  });
  // The read has fully answered (a new one is kept for the next open) and nothing changes for a beat.
  await expect.poll(() => lastReadAt(page), { timeout: 120_000 }).not.toBe(before);
  await page.waitForTimeout(1000);
}

test.use({ viewport: { width: 390, height: 844 } });
// A full read of every starter board, each list answering late, takes a while.
test.setTimeout(300_000);

// Signed out, Review reads nothing (#755, review-sign-in.spec.ts), so only a signed-in Review loads.
for (const who of ['signed in'] as const) {
  test(`Review never flashes its empty state while it loads (${who})`, async ({ page }) => {
    await fakeSupabase(page);
    // The boards answer only once the test opens the gate (after DELAY more).
    const gate = { open: Promise.resolve() };
    await feed(page, DELAY, gate);
    await record(page);
    // A first visit: a skeleton, never the empty state, until the boards answer.
    await page.goto('/#/review');
    await settle(page);
    expectSteady(await frames(page));
    // Open again: the last list shows at once and stays while the boards are read again.
    // Open again with the boards held: the last list shows from what was kept, before any board
    // answers, and stays while they are read again.
    const kept = await lastReadAt(page);
    let open = () => {};
    gate.open = new Promise((res) => (open = res));
    await page.reload();
    await expect(page.getByRole('article', { name: /Design Systems Lead at Orbel/ })).toBeVisible();
    await page.waitForTimeout(1500);
    open();
    await settle(page, kept);
    expectSteady(await frames(page));
  });
}
