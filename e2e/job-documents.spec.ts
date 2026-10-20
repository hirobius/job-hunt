import { test, expect } from '@playwright/test';

// Per-job Documents (#225) end to end: a job's Documents tab, a cover letter saved twice (two
// Versions), the second marked Sent (locked), then downloaded as a PDF built in the browser.
test('job page Documents: cover letter → 2 Versions → Sent → Download PDF', async ({ page }) => {
  await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  await page.goto('/#/queue');
  await page.getByRole('button', { name: 'Add job' }).click();
  await page.getByLabel('Job URL').fill('https://boards.greenhouse.io/acme/jobs/77');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('link', { name: 'Acme · Greenhouse' }).click();

  await page.getByRole('tab', { name: /^Documents/ }).click();
  await expect(page.getByText('No documents yet')).toBeVisible();
  await page.getByRole('button', { name: 'New document' }).click();
  await page.getByRole('combobox', { name: /^Kind/ }).click();
  await page.getByRole('option', { name: 'Cover letter' }).click();
  await page.getByRole('textbox', { name: 'Title' }).fill('Acme letter');
  await page.getByRole('textbox', { name: 'Text' }).fill('Dear Acme, first draft.');
  await page.getByRole('button', { name: 'Create' }).click();

  const card = page.getByRole('region', { name: 'Acme letter' });
  await expect(card).toBeVisible();
  await card.getByRole('textbox', { name: 'Text' }).fill('Dear Acme, the one I sent.');
  await card.getByRole('button', { name: 'Save version' }).click();
  await card.getByRole('button', { name: 'Versions (2)' }).click();
  await expect(card.getByText(/^Version 2 ·/)).toBeVisible();

  await card.getByRole('button', { name: 'Mark as Sent' }).nth(1).click();
  const confirm = page.getByRole('alertdialog', { name: 'Mark this version as Sent?' });
  await confirm.getByRole('button', { name: 'Mark as Sent' }).click();
  await expect(card.getByText(/^Locked, sent /)).toBeVisible();
  await expect(card.getByText('Sent v2')).toBeVisible();
  await expect(card.getByRole('button', { name: 'Mark as Sent' })).toHaveCount(0);

  await card.getByRole('button', { name: 'Download version 2' }).click();
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: 'Download PDF' }).click(),
  ]);
  expect(file.suggestedFilename()).toMatch(/-cover-letter-v2\.pdf$/);
  const bytes = await (await file.createReadStream()).toArray();
  expect(Buffer.concat(bytes).subarray(0, 5).toString()).toBe('%PDF-');
});
