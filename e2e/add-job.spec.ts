import { test, expect } from '@playwright/test';

// Core happy path: paste a job URL → it lands in the queue.
test('adds a pasted job URL to the queue', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Job URL').fill('https://boards.greenhouse.io/acme/jobs/77');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('link', { name: /boards/i })).toBeVisible();
});
