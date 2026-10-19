import { test, expect } from '@playwright/test';

// Core happy path: paste a job URL → it lands in the queue. The Pipeline is `#/queue`; the empty
// hash is Companies (Calm list).
test('adds a pasted job URL to the queue', async ({ page }) => {
  await page.goto('/#/queue');
  await page.getByRole('button', { name: 'Add job' }).click();
  await page.getByLabel('Job URL').fill('https://boards.greenhouse.io/acme/jobs/77');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Acme · Greenhouse' })).toBeVisible();
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
  await expect(dialog.getByRole('textbox', { name: 'Message' })).toHaveValue(/UX Researcher/);
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
