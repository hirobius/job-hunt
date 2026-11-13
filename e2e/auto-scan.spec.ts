import { test, expect, type Page } from '@playwright/test';
import { accountMenuItem, openScanDetails } from './routes';

// Auto-scan (simplify 8/11, #415). Signed out, nothing scans on open (2026-11-07: on a phone the
// browser scan drowned the sign-in screen; a signed-in account's boards are read by the server's
// sync every 15 minutes, and its scan on open is pinned in autoScanOnOpen.test.tsx). Scan now runs
// it: it finds a YC company hiring now (Acme, acme.com), probes for its board, confirms it against
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
  test(`signed out nothing scans on open; Scan now finds the postings (${width})`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 900 });
    const asked: string[] = [];
    await network(page, asked);
    await page.goto('/#/find');
    // A design-systems track that follows nothing yet.
    await page.evaluate(seedTrack);
    // No status text on Find (Adrian 2026-11-08); Scan now is the Account menu's (#694). Nothing
    // read yet: the empty state, and no List | Deck toggle beside it (Adrian 2026-11-13).
    await expect(page.getByRole('region', { name: 'No postings' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^View: / })).toHaveCount(0);
    await page.waitForTimeout(3000);
    expect(asked.filter((u) => u.includes('yc-oss.github.io'))).toEqual([]);
    const since = await page.evaluate(() => Date.now());
    await accountMenuItem(page, 'Scan now');
    await scanFinished(page, since);
    // The scan's line is Scan details, in the Account menu's Search profile (#549).
    const details = await openScanDetails(page);
    await expect(
      details.getByText(/^Scanning [\d,]+ sources? · Last scanned \d\d:\d\d, \d+ new$/),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(details).toBeHidden();
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

test('Scan now runs again and Follow moves Acme into the followed boards (390)', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 900 });
  await network(page);
  await page.goto('/#/find');
  await page.evaluate(seedTrack);
  const since = await page.evaluate(() => Date.now());
  await accountMenuItem(page, 'Scan now');
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

  const again = await page.evaluate(() => Date.now());
  await accountMenuItem(page, 'Scan now');
  // While it runs the Account menu offers Stop scan in its place.
  await page.getByRole('button', { name: /^Account/ }).click();
  await expect(page.getByRole('menuitem', { name: 'Stop scan' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Scan now' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await scanFinished(page, again);
  // When it last scanned is Scan details' line only (#694).
  const details = await openScanDetails(page);
  await expect(details.getByText(/· Last scanned \d\d:\d\d, \d+ new$/)).toBeVisible();
  await page.keyboard.press('Escape');
});
