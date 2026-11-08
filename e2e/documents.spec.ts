import { JOB_LINK, openApply, openTemplates, currentTab } from './routes';
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
  const docs = page.getByRole('dialog', { name: 'Documents' });
  await expect(docs).toBeVisible();
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
  // Documents is a dialog over Apply (#471 slice 4): Close goes back to it.
  await docs.getByRole('button', { name: 'Close' }).click();
  await expect(docs).toBeHidden();
  await openApply(page);
  await openTemplates(page);
  const list = page.getByRole('list', { name: 'Your templates' });
  // The row opens a dialog with the edited message filled for the job (Proposal A).
  await list.getByRole('button', { name: 'Open Follow-up after applying' }).click();
  const view = page.getByRole('dialog', { name: 'Follow-up after applying' });
  await expect(view.getByText(/I applied for the Fabricator role at Acme Metals/)).toBeVisible();
  await expect(view.getByText(/See you soon\./)).toBeVisible();
  // A blank fills in place and saves on the job (rev-3 A).
  await view.getByRole('button', { name: 'Fill Contact' }).click();
  await view.getByRole('textbox', { name: 'Contact' }).fill('Dana');
  await view.getByRole('button', { name: 'Fill', exact: true }).click();
  await expect(view.getByText(/Hi Dana,/).first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(view).toBeHidden();
  // The row's one-line preview now reads the filled name.
  await expect(list.getByText(/Hi Dana,/).first()).toBeVisible();
  // Documents opens as a dialog over this job (#471 slice 4), so closing it or a Save comes back here.
  await expect(page.getByRole('link', { name: 'Edit documents' })).toHaveAttribute(
    'href',
    /^#\/apply\/[^?]+\?documents=$/,
  );

  // The job page links its company to the Company page, which links back to the job.
  await page.evaluate(() => (location.hash = '#/apply'));
  await page.getByRole('navigation', { name: 'Jobs' }).locator(JOB_LINK).first().click();
  await page.getByRole('link', { name: 'Acme Metals', exact: true }).click();
  await expect(page).toHaveURL(/#\/apply\/company\/acme-metals\?from=%2Fapply%2F/);
  await expect(page.getByRole('heading', { level: 1, name: 'Acme Metals' })).toBeVisible();
  await expect(currentTab(page).filter({ hasText: 'Apply' })).toBeVisible();
  await page.getByRole('link', { name: 'Fabricator', exact: true }).click();
  await expect(page).toHaveURL(/#\/apply\//);
});

// Restore starter messages answers at 390 (#327, #212): the rows can land below the fold, so the
// tap toasts what it added and scrolls the first restored row into view with a flash.
test('Restore starter messages toasts and shows the first restored row (390)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  await page.goto('/#/find?documents=');
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
