import { test, expect, type Page } from '@playwright/test';

// Auto-scan (simplify 8/11, #415). Signed out, nothing scans on open (2026-11-07: on a phone the
// browser scan drowned the sign-in screen; a signed-in account's boards are read by the server's
// sync every 15 minutes, and its scan on open is pinned in autoScanOnOpen.test.tsx). Scan now runs
// it: it finds a YC company hiring now (Acme, acme.com), probes for its board, confirms it against
// the website (#417), reads it with every feed and keeps its remote design-system role. Review new
// shows that posting and Acme under New companies. Every host is synthetic: YC's mirror lists
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
    await expect(page.getByText('Sign in for automatic updates.')).toBeVisible();
    await page.waitForTimeout(3000);
    expect(asked.filter((u) => u.includes('yc-oss.github.io'))).toEqual([]);
    await page.getByRole('button', { name: 'Scan now' }).click();

    await expect(
      page.getByText(/^Scanning [\d,]+ sources? · Last scanned \d\d:\d\d, \d+ new$/),
    ).toBeVisible({
      timeout: 60_000,
    });
    const list = page.getByRole('list', { name: 'New postings' });
    await expect(list.getByText('Senior Design Systems Engineer')).toBeVisible();
    // Remote only (Adrian 2026-10-28): Acme's on-site role is left out.
    await expect(list.getByText('Design Systems Lead')).toHaveCount(0);
    const companies = page.getByRole('list', { name: 'New companies' });
    await expect(companies.getByText('Acme')).toBeVisible();
    await expect(companies.getByText('1 matching job · from YC')).toBeVisible();

    if (width === 390)
      for (const scheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: scheme });
        await page.screenshot({ path: `test-results/auto-scan-390-${scheme}.png`, fullPage: true });
      }
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
  await page.getByRole('button', { name: 'Scan now' }).click();
  const status = page.getByText(/^Scanning [\d,]+ sources? · Last scanned /);
  await expect(status).toBeVisible({ timeout: 60_000 });

  await page.getByRole('button', { name: 'Follow Acme' }).click();
  const notice = page.getByRole('region', { name: /^Notifications/ }).getByRole('listitem');
  await expect(notice.getByText('Following Acme')).toBeVisible();
  await expect(page.getByRole('list', { name: 'New companies' })).toHaveCount(0);
  // Followed, its role still shows (now read as a followed board).
  await expect(
    page.getByRole('list', { name: 'New postings' }).getByText('Senior Design Systems Engineer'),
  ).toBeVisible();

  // Followed, it is in the Account menu's Companies list.
  await page.getByRole('button', { name: 'Account' }).click();
  await page.getByRole('menuitem', { name: 'Companies' }).click();
  const dialog = page.getByRole('dialog', { name: 'Companies' });
  await expect(dialog.getByRole('list', { name: 'Followed' }).getByText(/^Acme/)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  await page.getByRole('button', { name: 'Scan now' }).click();
  await expect(page.getByRole('button', { name: 'Stop scan' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Scan now' })).toBeVisible({ timeout: 60_000 });
  await expect(status).toBeVisible();
});
