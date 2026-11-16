import { test, expect, type Page } from './fixtures';
import { signInAtBoot } from './fixtures';

// Auto-scan (simplify 8/11, #415). Signed out, nothing scans and Review reads nothing (#755).
// Signed in, the scan runs on open: it finds a YC company hiring now (Acme, acme.com), probes for its board, confirms it against
// the website (#417), reads it with every feed and keeps its remote design-system role. Review new
// shows that posting; Acme is in the Account menu's Companies dialog, under Found (#618). Every host is synthetic: YC's mirror lists
// Acme, Acme's Greenhouse board has two roles, everything else answers empty or "no such board".
const ACME_JOBS = {
  jobs: [
    {
      id: 101,
      title: 'Senior Design Systems Engineer',
      absolute_url: 'https://boards.greenhouse.io/acme/jobs/101',
      location: { name: 'Remote' },
      first_published: new Date().toISOString(),
      content: '&lt;p&gt;Own our design system.&lt;/p&gt;',
    },
    {
      id: 102,
      title: 'Design Systems Lead',
      absolute_url: 'https://boards.greenhouse.io/acme/jobs/102',
      location: { name: 'Paris (On-site)' },
      first_published: new Date().toISOString(),
      content: '',
    },
  ],
};

async function network(page: Page, asked: string[] = []) {
  await page.route(/^https?:\/\/(?!localhost)/, (r) => {
    const url = r.request().url();
    asked.push(url);
    const json = (body: unknown, status = 200) =>
      r.fulfill({
        status,
        headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    if (url === 'https://yc-oss.github.io/api/companies/hiring.json')
      return json([
        {
          name: 'Acme',
          slug: 'acme',
          website: 'https://acme.com',
          one_liner: 'The design system platform for banks',
          status: 'Active',
          isHiring: true,
        },
      ]);
    if (url.startsWith('https://boards-api.greenhouse.io/v1/boards/acme/')) return json(ACME_JOBS);
    if (url.startsWith('https://api.github.com/')) return json({ items: [] });
    if (url.startsWith('https://hn.algolia.com/')) return json({ hits: [] });
    if (url.startsWith('https://remotive.com/') || url.startsWith('https://jobicy.com/'))
      return json({ jobs: [] });
    // Every other board: no such board.
    return json({}, 404);
  });
}

/** A fresh Search profile: a design-system title, remote only, no followed boards (runs in the
 *  page). */
async function seedTrack() {
  const profile = await import('/src/profile.ts');
  profile.saveProfile({
    titles: ['Design Systems Engineer'],
    include: { terms: ['design system'] },
    mode: 'remote',
  });
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
  test(`signed out nothing scans or reads (${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const asked: string[] = [];
    await network(page, asked);
    await page.goto('/#/review');
    await page.evaluate(seedTrack);
    // Signed out, Review is its sign-in line (#755): no posting read, no scan, no Scan now.
    await expect(page.getByText('Sign in to see new postings.')).toBeVisible();
    await page.waitForTimeout(3000);
    // The analytics script is not a read of postings.
    expect(asked.filter((u) => new URL(u).hostname !== 'va.vercel-scripts.com')).toEqual([]);
    await page.getByRole('button', { name: /^Account/ }).click();
    await expect(page.getByRole('menuitem', { name: 'Search profile' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /^(Scan now|Stop scan)$/ })).toHaveCount(0);
  });

  test(`signed in the scan on open finds the postings (${width})`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 900 });
    await signInAtBoot(page);
    await network(page);
    const since = Date.now();
    await page.goto('/#/review');
    await scanFinished(page, since);
    const list = page.getByRole('list', { name: 'New postings' });
    await expect(list.getByText('Senior Design Systems Engineer')).toBeVisible();
    // Remote only (Adrian 2026-10-28): Acme's on-site role is left out.
    await expect(list.getByText('Design Systems Lead')).toHaveCount(0);
    // Found companies left Find (#618): they are the Companies dialog's Found list.
    await expect(page.getByText('New companies')).toHaveCount(0);
    await page.getByRole('button', { name: 'Account' }).click();
    await page.getByRole('menuitem', { name: 'Companies' }).click();
    const dialog = page.getByRole('dialog', { name: 'Companies' });
    await dialog.getByRole('radio', { name: 'Found (1)' }).click();
    const companies = dialog.getByRole('list', { name: 'Found companies' });
    await expect(companies.getByText('Acme', { exact: true })).toBeVisible();
    await expect(companies.getByText('acme.com', { exact: true })).toBeVisible();
    await expect(companies.getByText('1 matching job · from YC')).toBeVisible();
    // Who they are and what the scan read (Adrian 2026-11-08): YC's one-liner, the website,
    // the confirmed board and a Preview of the open roles.
    await expect(companies.getByText('The design system platform for banks')).toBeVisible();
    await expect(companies.getByRole('link', { name: "Visit Acme's website" })).toBeVisible();
    await expect(companies.getByRole('link', { name: /^Acme job board/ })).toBeVisible();
    await companies.getByRole('button', { name: 'Preview open roles (1)' }).click();
    await expect(
      page
        .getByRole('list', { name: 'Open roles at Acme' })
        .getByText('Senior Design Systems Engineer'),
    ).toBeVisible();

    if (width === 390)
      for (const scheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: scheme });
        await page.screenshot({ path: `test-results/auto-scan-390-${scheme}.png` });
      }
    else await page.screenshot({ path: `test-results/auto-scan-${width}.png` });
  });
}

test('signed in, Follow moves a found company into the followed boards (390)', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 900 });
  await signInAtBoot(page);
  await network(page);
  const since = Date.now();
  await page.goto('/#/review');
  await scanFinished(page, since);

  // Found companies are the Companies dialog's Found list (#618).
  await page.getByRole('button', { name: 'Account' }).click();
  await page.getByRole('menuitem', { name: 'Companies' }).click();
  const dialog = page.getByRole('dialog', { name: 'Companies' });
  await dialog.getByRole('radio', { name: 'Found (1)' }).click();
  await dialog.getByRole('button', { name: 'Follow Acme' }).click();
  // The dialog says so, with Undo (the toast behind a modal can't be reached).
  await expect(dialog.getByText('Following Acme')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Undo' })).toBeVisible();
  // The last found company gone: the Found segment goes and Followed shows, with Acme in it.
  await expect(dialog.getByRole('radio', { name: /^Found/ })).toHaveCount(0);
  await expect(dialog.getByRole('list', { name: 'Followed' }).getByText(/^Acme/)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  // Followed, its role still shows (now read as a followed board).
  await expect(
    page.getByRole('list', { name: 'New postings' }).getByText('Senior Design Systems Engineer'),
  ).toBeVisible();

  await page.keyboard.press('Escape');
});
