import { test, expect } from '@playwright/test';

// One Find box (#384), reached from the Pipeline's Add job dialog until Today hosts it: a pasted
// job link saves the job; a board is followed at once; a title joins the Search profile (a first
// visit has one on its own).

test.beforeEach(async ({ context }) => {
  await context.route('https://icons.duckduckgo.com/**', (r) => r.abort());
});

const openFind = async (page: import('@playwright/test').Page) => {
  await page.goto('/#/apply');
  await page.getByRole('button', { name: 'Add job' }).click();
  await page
    .getByRole('dialog', { name: 'Add a job' })
    .getByRole('button', { name: 'Type a company or title instead' })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Find' });
  await expect(dialog.getByRole('textbox', { name: 'Find' })).toBeFocused();
  return dialog;
};

test('a job link pasted into Find lands in the Pipeline', async ({ page }) => {
  const dialog = await openFind(page);
  await dialog.getByRole('textbox', { name: 'Find' }).fill('https://jobs.lever.co/acme/77');
  await expect(dialog.getByText('Saves this job to To apply.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Find' }).click();
  await expect(dialog).toBeHidden();
  // From lg the Jobs tab opens on the newest job beside the list (#471).
  await expect(page.getByRole('heading', { level: 1, name: 'Acme · Lever' })).toBeVisible();
});

test('a board is followed at once; a title joins the Search profile', async ({ page }) => {
  const dialog = await openFind(page);
  const field = dialog.getByRole('textbox', { name: 'Find' });
  await field.fill('https://jobs.lever.co/acme');
  await expect(dialog.getByText('Follows Acme’s board.')).toBeVisible();
  await field.press('Enter');
  await expect(page.getByText('Following Acme').first()).toBeVisible();
  await page.getByRole('button', { name: 'Add job' }).click();
  await page
    .getByRole('dialog', { name: 'Add a job' })
    .getByRole('button', { name: 'Type a company or title instead' })
    .click();
  await field.fill('Design Technologist');
  await expect(dialog.getByText('Adds “Design Technologist” to your titles.')).toBeVisible();
  await field.press('Enter');
  // A first visit has the design-systems profile on its own (no setup screen).
  await expect(page.getByText('Added “Design Technologist” to your titles').first()).toBeVisible();
});
