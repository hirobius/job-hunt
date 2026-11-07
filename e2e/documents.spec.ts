import { openApply } from './routes';
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
  await page.goto('/#/apply');
  // The Jobs tab: the Pipeline, or from lg the list beside the first job (#471).
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  // Documents opens from the Menu. A first run has no messages (Adrian 2026-10-22): its empty
  // state adds the starters in one tap, as Outreach messages.
  await page.getByRole('button', { name: /^Account/ }).click();
  await page.getByRole('menuitem', { name: 'Documents' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Documents' })).toBeVisible();
  await expect(page.getByText('No documents yet')).toBeVisible();
  await page.getByRole('button', { name: 'Add starter messages' }).click();
  const outreach = page.getByRole('region', { name: 'Outreach messages' });
  // The row expands in place (rev-3 M); Open goes to the editor.
  await outreach.getByRole('button', { name: 'Follow-up after applying' }).click();
  await outreach.getByRole('button', { name: 'Open Follow-up after applying' }).click();

  // Edit the text and save it as version 2.
  const text = page.getByRole('textbox', { name: 'Message text' });
  await text.focus();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' See you soon.');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Version history (2)' })).toBeVisible();

  // The Apply sheet fills the edited message for the job.
  await page.getByRole('button', { name: 'All documents' }).click();
  await page.getByRole('link', { name: 'Back to Apply' }).click();
  await openApply(page);
  const list = page.getByRole('list', { name: 'Your templates' });
  // The row previews the start of the edited text (no chevron: Copy is its one action).
  await expect(list.getByText(/I applied for the Fabricator role at Acme Metals/)).toBeVisible();
  // A blank fills in place and saves on the job (rev-3 A).
  // Every row shares the job's Contact blank; fill it on the follow-up's row.
  const row = list.getByRole('listitem', { name: 'Follow-up after applying' });
  await row.getByRole('button', { name: 'Fill Contact' }).click();
  await row.getByRole('textbox', { name: 'Contact' }).fill('Dana');
  await row.getByRole('button', { name: 'Fill', exact: true }).click();
  await expect(list.getByText(/Hi Dana,/).first()).toBeVisible();
  // Documents remembers Apply mode, so its Back and a Save come back here (return paths).
  await expect(page.getByRole('link', { name: 'Edit documents' })).toHaveAttribute(
    'href',
    /^#\/copy-deck\?from=%2Fapply%2F/,
  );

  // The job page links its company to the Company page, which links back to the job.
  await page.evaluate(() => (location.hash = '#/apply'));
  await page.locator('a[href^="#/apply/"]').first().click();
  await page.getByRole('link', { name: 'Acme Metals', exact: true }).click();
  await expect(page).toHaveURL(/#\/company\/acme-metals\?from=%2Fapply%2F/);
  await expect(page.getByRole('heading', { level: 1, name: 'Acme Metals' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Apply', selected: true })).toBeVisible();
  await page.getByRole('link', { name: 'Fabricator', exact: true }).click();
  await expect(page).toHaveURL(/#\/apply\//);
});

// Restore starter messages answers at 390 (#327, #212): the rows can land below the fold, so the
// tap toasts what it added and scrolls the first restored row into view with a flash.
test('Restore starter messages toasts and shows the first restored row (390)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  await page.goto('/#/copy-deck');
  await page.getByRole('button', { name: 'Start from scratch' }).click();
  const outreach = page.getByRole('region', { name: 'Outreach messages' });
  await outreach.getByRole('button', { name: 'Restore starter messages' }).click();
  // The toast, not its copy in the screen-reader announcer (#365), which holds the same words for 1 s.
  const toast = page.getByText('Added 4 starter messages', { exact: true });
  await expect(toast.and(page.locator(':not([data-rjb-announcer])'))).toBeVisible();
  const first = outreach.getByRole('listitem').first();
  await expect(first).toHaveAttribute('data-motion', 'flash');
  await expect(first).toBeInViewport();
});
