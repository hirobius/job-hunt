import { test, expect } from '@playwright/test';

// Core happy path: paste a job URL → it lands in the queue. The Pipeline is `#/queue`; the empty
// hash is Companies (Calm list).

// Company logos come from a third-party icon host; tests never reach it (letters show).
test.beforeEach(async ({ context }) => {
  await context.route('https://icons.duckduckgo.com/**', (r) => r.abort());
});

test('adds a pasted job URL to the queue', async ({ page }) => {
  await page.goto('/#/queue');
  await page.getByRole('button', { name: 'Add job' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a job' });
  await dialog.getByLabel('Job link').fill('https://boards.greenhouse.io/acme/jobs/77');
  await dialog.getByRole('button', { name: 'Add job' }).click();
  await expect(page.getByRole('link', { name: 'Acme · Greenhouse', exact: true })).toBeVisible();
});

// QA: a link that isn't one keeps the dialog open with a field error; the same link twice says it
// is already in the Pipeline instead of closing in silence.
test('Add job explains a bad link and an already saved one', async ({ page }) => {
  await page.goto('/#/queue');
  await page.getByRole('button', { name: 'Add job' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a job' });
  await dialog.getByLabel('Job link').fill('not a url');
  await dialog.getByRole('button', { name: 'Add job' }).click();
  await expect(
    dialog.getByText('Paste the full link to the posting, like https://…'),
  ).toBeVisible();
  await dialog.getByLabel('Job link').fill('https://jobs.lever.co/acme/1');
  await dialog.getByRole('button', { name: 'Add job' }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: 'Add job' }).first().click();
  await dialog.getByLabel('Job link').fill('https://jobs.lever.co/acme/1');
  await dialog.getByLabel('Job link').press('Enter');
  const notices = page.getByRole('region', { name: /^Notifications/ });
  await expect(notices.getByText('Already in your Pipeline')).toBeVisible();
  await notices.getByRole('button', { name: 'Open' }).click();
  await expect(page).toHaveURL(/#\/queue\/./);
});

// A first visit offers the sample pipeline, which lands on the Pipeline with its follow-ups
// (#236: Today is gone; its follow-ups live in the Pipeline).
test('opens on Companies setup; the sample pipeline lists due follow-ups', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/#\/discover$/);
  await page.getByRole('button', { name: 'Try with sample data' }).click();
  await expect(page).toHaveURL(/#\/queue$/);
  const followUps = page.getByRole('region', { name: /^Follow up \(/ });
  await expect(followUps).toBeVisible();
  await followUps.getByRole('button', { name: 'Follow up: UX Researcher' }).click();
  const dialog = page.getByRole('dialog', { name: 'Follow up' });
  // A first run has no messages (Adrian 2026-10-22): one tap adds the starters and fills it.
  await dialog.getByRole('button', { name: 'Add starter messages' }).click();
  await expect(dialog).toContainText('UX Researcher role');
  await dialog.getByRole('button', { name: 'Copy message' }).click();
  await dialog.getByRole('button', { name: 'Mark as sent' }).click();
  await expect(dialog.getByText('Follow-up sent. Next one due in 7 days.')).toBeVisible();
});

// An old #/today link (#236) lands on Companies and leaves no history entry behind.
test('#/today redirects to Companies', async ({ page }) => {
  await page.goto('/#/queue');
  await page.goto('/#/today');
  await expect(page).toHaveURL(/#\/discover$/);
  await page.goBack();
  await expect(page).toHaveURL(/#\/queue$/);
});
