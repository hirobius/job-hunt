import { test, expect } from '@playwright/test';
import { topTab, currentTab } from './routes';

// Core happy path: paste a job URL → it lands in the queue. The Pipeline is `#/apply`; the empty
// hash is Companies (Calm list).

// Nothing leaves localhost: company logos (letters show) and the job boards Today's auto scan
// reads on arrival. Reading the live boards parsed megabytes on the page's main thread (long
// tasks up to ~0.8 s), so every click crawled and the sample-pipeline walk ran past 30 s.
test.beforeEach(async ({ context }) => {
  await context.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
});

test('adds a pasted job URL to the queue', async ({ page }) => {
  await page.goto('/#/apply');
  await page.getByRole('button', { name: 'Add job' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a job' });
  await dialog.getByLabel('Job link').fill('https://boards.greenhouse.io/acme/jobs/77');
  await dialog.getByRole('button', { name: 'Add job' }).click();
  // From lg the Jobs tab opens on the newest job beside the list (#471).
  await expect(page.getByRole('heading', { level: 1, name: 'Acme · Greenhouse' })).toBeVisible();
});

// QA: a link that isn't one keeps the dialog open with a field error; the same link twice says it
// is already in the Pipeline instead of closing in silence.
test('Add job explains a bad link and an already saved one', async ({ page }) => {
  await page.goto('/#/apply');
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
  await expect(page).toHaveURL(/#\/apply\/./);
});

// #551: one field and one filled key. A bottom sheet on a phone with Add job at full width, a
// centred dialog at 1440 with Add job at the right. No Cancel key: Close and the scrim cancel.
test('Add job at 390 is a bottom sheet with Add job at full width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/apply');
  await page.getByRole('button', { name: 'Add job' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Add a job' });
  await expect(dialog.getByLabel('Job link')).toBeFocused();
  await expect(
    dialog.getByText('The title fills in from the link. You can edit it after.'),
  ).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toHaveCount(0);
  const sheet = (await dialog.boundingBox())!;
  expect(Math.round(sheet.y + sheet.height)).toBe(844);
  expect(Math.round(sheet.width)).toBe(390);
  const key = (await dialog.getByRole('button', { name: 'Add job' }).boundingBox())!;
  const grey = (await dialog
    .getByRole('button', { name: 'Type a company or title instead' })
    .boundingBox())!;
  // Full width: as wide as the field, inside the 16px gutter; the grey key under it; both 44px
  // tall at least.
  const field = (await dialog.getByLabel('Job link').boundingBox())!;
  expect(Math.abs(key.x - field.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(key.width - field.width)).toBeLessThanOrEqual(1);
  expect(key.width).toBeGreaterThanOrEqual(390 - 32 - 4);
  expect(grey.y).toBeGreaterThan(key.y);
  expect(key.height).toBeGreaterThanOrEqual(44);
  expect(grey.height).toBeGreaterThanOrEqual(44);
  const close = (await dialog.getByRole('button', { name: 'Close' }).boundingBox())!;
  expect(close.width).toBeGreaterThanOrEqual(44);
  expect(close.height).toBeGreaterThanOrEqual(44);
  // The scrim cancels: a tap above the sheet closes it.
  await page.mouse.click(195, 40);
  await expect(dialog).toBeHidden();
});

test('Add job at 1440 is a centred dialog with Add job at the right; Close cancels', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#/apply');
  await page.getByRole('button', { name: 'Add job' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Add a job' });
  await expect(dialog).toBeVisible();
  const box = (await dialog.boundingBox())!;
  expect(Math.abs(box.x + box.width / 2 - 720)).toBeLessThanOrEqual(1);
  const key = (await dialog.getByRole('button', { name: 'Add job' }).boundingBox())!;
  const grey = (await dialog
    .getByRole('button', { name: 'Type a company or title instead' })
    .boundingBox())!;
  expect(key.x).toBeGreaterThan(grey.x);
  expect(Math.abs(key.y - grey.y)).toBeLessThanOrEqual(1);
  await dialog.getByLabel('Job link').fill('https://jobs.lever.co/acme/2');
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();
  // Cancelled: nothing was saved, and focus is back on the Add job that opened it.
  await expect(page.getByRole('button', { name: 'Add job' }).first()).toBeFocused();
  await expect(page.getByRole('heading', { level: 1, name: 'Acme · Lever' })).toHaveCount(0);
});

// A first visit opens on Today with no setup screen; the Jobs empty state offers the sample
// pipeline, with its follow-ups.
test('opens on Today with no setup; the sample pipeline lists due follow-ups', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/#\/review$/);
  await expect(page.getByRole('heading', { name: 'New postings' })).toBeVisible();
  await expect(page.getByText('Set up your search')).toHaveCount(0);
  await topTab(page, 'Apply').click();
  await page.getByRole('button', { name: 'Try with sample data' }).click();
  await expect(page).toHaveURL(/#\/apply$/);
  const followUps = page.getByRole('region', { name: /^Follow up \(/ });
  await expect(followUps).toBeVisible();
  await followUps.getByRole('button', { name: 'Follow up: Design Systems Designer' }).click();
  const dialog = page.getByRole('dialog', { name: 'Follow up' });
  // A first run has no messages (Adrian 2026-10-22): one tap adds the starters and fills it.
  await dialog.getByRole('button', { name: 'Add starter messages' }).click();
  await expect(dialog).toContainText('Design Systems Designer role');
  await dialog.getByRole('button', { name: 'Copy message' }).click();
  await dialog.getByRole('button', { name: 'Mark as sent' }).click();
  await expect(dialog.getByText('Follow-up sent. Next one due in 7 days.')).toBeVisible();
});

// #/review is home again (#383): it opens Today, and Back goes to the page before.
test('#/review opens Today', async ({ page }) => {
  await page.goto('/#/apply');
  await page.goto('/#/review');
  await expect(page).toHaveURL(/#\/review$/);
  await expect(currentTab(page).filter({ hasText: 'Review' })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/#\/apply$/);
});
