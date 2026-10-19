import { test, expect } from '@playwright/test';

// Core happy path: paste a job URL → it lands in the queue. The Pipeline is `#/queue`; the empty
// hash is Today (#128).
test('adds a pasted job URL to the queue', async ({ page }) => {
  await page.goto('/#/queue');
  await page.getByRole('button', { name: 'Add job' }).click();
  await page.getByLabel('Job URL').fill('https://boards.greenhouse.io/acme/jobs/77');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Acme · Greenhouse' })).toBeVisible();
});

// Today is home: a first visit offers the sample pipeline, which lands on a working Today.
test('opens on Companies setup; the sample pipeline lists due follow-ups', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/#\/discover$/);
  await page.getByRole('button', { name: 'Try with sample data' }).click();
  await page.goto('/#/today');
  await expect(page.getByRole('region', { name: /^Follow-ups due/ })).toBeVisible();
  await page.getByRole('button', { name: 'Log follow-up: UX Researcher' }).click();
  await expect(page.getByText('Follow-up logged', { exact: true })).toBeVisible();
});
