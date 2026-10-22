import { test, expect } from '@playwright/test';

// Export links (2026-10-22) end to end: the dialog opens from the Pipeline's Jobs panel (on This
// view) and from the Account menu (on All saved jobs), switches scope and format, copies to the
// clipboard and downloads a .txt. Two fictional jobs are seeded; every non-local host is refused.
const ACME = 'https://acme.example/jobs/welder';
const ZENITH = 'https://zenith.example/jobs/fitter';
const JOBS = [
  {
    url: ACME,
    label: 'Welder',
    company: 'Acme',
    status: 'Saved',
    added: '2026-10-02T00:00:00.000Z',
  },
  {
    url: ZENITH,
    label: 'Fitter',
    company: 'Zenith',
    status: 'Applied',
    applied: '2026-10-03',
    added: '2026-10-01T00:00:00.000Z',
  },
];

test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  await page.addInitScript((jobs) => {
    if (!localStorage.getItem('rjb_shortlist'))
      localStorage.setItem('rjb_shortlist', JSON.stringify(jobs));
  }, JOBS);
});

test('export links: open, switch scope and format, copy and download', async ({ page }) => {
  await page.goto('/#/queue');
  await expect(page.getByRole('heading', { name: 'Pipeline' })).toBeVisible();

  // The Jobs panel opens it on this view: Active holds Acme only.
  await page
    .getByRole('region', { name: 'Jobs' })
    .getByRole('button', { name: 'Export links' })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Export links' });
  const preview = dialog.getByRole('textbox', { name: 'Preview' });
  await expect(dialog.getByRole('radio', { name: 'This view (1)' })).toBeChecked();
  await expect(preview).toHaveValue(ACME);

  // All saved jobs, then with title and company.
  await dialog.getByRole('radio', { name: 'All saved jobs (2)' }).click();
  await expect(preview).toHaveValue(`${ACME}\n${ZENITH}`);
  await dialog.getByRole('radio', { name: 'With title and company' }).click();
  const titled = `Welder — Acme\n${ACME}\n\nFitter — Zenith\n${ZENITH}`;
  await expect(preview).toHaveValue(titled);

  // Copy puts the list on the clipboard and says how many.
  await dialog.getByRole('button', { name: 'Copy' }).click();
  await expect(page.getByText('Copied 2 links')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(titled);

  // Download .txt saves the same text under the brand + date name.
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: 'Download .txt' }).click(),
  ]);
  expect(file.suggestedFilename()).toMatch(/^[a-z0-9-]+-links-\d{4}-\d\d-\d\d\.txt$/);
  const path = await file.path();
  const { readFileSync } = await import('node:fs');
  expect(readFileSync(path, 'utf8')).toBe(titled);
});

test('export links opens from the Account menu on all saved jobs', async ({ page }) => {
  await page.goto('/#/queue');
  await page.getByRole('button', { name: /^Account/ }).click();
  await page.getByRole('menuitem', { name: 'Export links' }).click();
  const dialog = page.getByRole('dialog', { name: 'Export links' });
  await expect(dialog.getByRole('radio', { name: 'All saved jobs (2)' })).toBeChecked();
});

test('export links sits in a ⋯ menu on a phone, with 40px targets', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/queue');
  const more = page
    .getByRole('region', { name: 'Jobs' })
    .getByRole('button', { name: 'More job actions' });
  expect((await more.boundingBox())?.height).toBeGreaterThanOrEqual(40);
  await more.click();
  await page.getByRole('menuitem', { name: 'Export links' }).click();
  const dialog = page.getByRole('dialog', { name: 'Export links' });
  await expect(dialog).toBeVisible();
  for (const el of await dialog.locator('button, [role="radio"]').all()) {
    const box = await el.boundingBox();
    if (box && box.width > 0) expect(box.height, await el.innerText()).toBeGreaterThanOrEqual(40);
  }
});
