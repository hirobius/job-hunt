import { test, expect } from '@playwright/test';

// The Documents library end to end (#227, #230): it opens from the Menu, an edited Outreach message
// (saved as a new Version) is what the Apply sheet fills for a job, and a job's company opens its
// Company page. One fictional job is seeded; every non-local host is refused.
const JOB = {
  url: 'https://acme.example/jobs/fabricator',
  label: 'Fabricator',
  company: 'Acme Metals',
  status: 'Saved',
  added: '2026-10-01T00:00:00.000Z',
};

test('edit a message in Documents → the Apply sheet uses it → the job opens its company', async ({
  page,
}) => {
  await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  await page.addInitScript((j) => {
    if (!localStorage.getItem('rjb_shortlist'))
      localStorage.setItem('rjb_shortlist', JSON.stringify([j]));
  }, JOB);
  await page.goto('/#/queue');
  await expect(page.getByRole('heading', { name: 'Pipeline' })).toBeVisible();

  // Documents opens from the Menu; the starter templates are Outreach messages now.
  await page.getByRole('button', { name: /^Account/ }).click();
  await page.getByRole('menuitem', { name: 'Documents' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Documents' })).toBeVisible();
  const outreach = page.getByRole('region', { name: 'Outreach messages' });
  await outreach.getByRole('button', { name: 'Follow-up after applying' }).click();

  // Edit the text and save it as version 2.
  const text = page.getByRole('textbox', { name: 'Message text' });
  await text.focus();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' See you soon.');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Version history (2)' })).toBeVisible();

  // The Apply sheet fills the edited message for the job.
  await page.getByRole('button', { name: 'All documents' }).click();
  await page.getByRole('link', { name: 'Back to Pipeline' }).click();
  await page.getByRole('button', { name: 'Start applying' }).click();
  await expect(page).toHaveURL(/#\/apply\//);
  const list = page.getByRole('list', { name: 'Your templates' });
  await list.getByRole('button', { name: 'Show all of Follow-up after applying' }).click();
  await expect(list.getByText(/I applied for the Fabricator role at Acme Metals/)).toBeVisible();
  await expect(list.getByText(/See you soon\./)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Edit documents' })).toHaveAttribute(
    'href',
    '#/copy-deck',
  );

  // The job page links its company to the Company page, which links back to the job.
  await page.evaluate(() => (location.hash = '#/queue'));
  await page.locator('a[href^="#/queue/"]').first().click();
  await page.getByRole('link', { name: 'Acme Metals', exact: true }).click();
  await expect(page).toHaveURL(/#\/company\/acme-metals$/);
  await expect(page.getByRole('heading', { level: 2, name: 'Acme Metals' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Pipeline', selected: true })).toBeVisible();
  await page.getByRole('link', { name: 'Fabricator', exact: true }).click();
  await expect(page).toHaveURL(/#\/queue\//);
});
