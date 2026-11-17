import { test, expect, type Page } from './fixtures';
import { seed, openByTitle, allWorkModes } from './routes';

// The filled key follows the state (#540): one filled key, then a grey key and an exit.
const ranks = (page: Page) =>
  page
    .getByRole('group', { name: /^Actions for / })
    .locator('a, button')
    .evaluateAll((els) => els.map((e) => [e.textContent?.trim(), e.getAttribute('data-variant')]));

/** Open a job by its title: the rail from lg, the view picker and the pager below it. */
async function openTitled(page: Page, title: string, _width: number) {
  await page.goto('/#/apply');
  await page.getByRole('heading', { level: 1 }).first().waitFor();
  await openByTitle(page, title);
}

for (const width of [390, 1440]) {
  test.describe(`job states ${width}`, () => {
    test.use({ viewport: { width, height: width === 390 ? 844 : 900 } });

    test('to apply, then follow-up due with Undo', async ({ page }) => {
      await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
      await seed(page);
      await allWorkModes(page);
      await page.goto('/#/apply');
      // Default: Open application filled, Mark applied grey, Not a fit the exit.
      await expect
        .poll(() => ranks(page))
        .toEqual([
          ['Open application', 'primary'],
          ['Mark applied', 'secondary'],
          ['Not a fit', 'link'],
        ]);
      await expect(page.getByRole('button', { name: /^Templates \(/ })).toHaveCount(0);

      // Follow-up due (the sample's Design Systems Lead).
      await openTitled(page, 'Design Systems Lead', width);
      await expect
        .poll(() => ranks(page))
        .toEqual([
          ['Copy follow-up', 'primary'],
          ['Mark followed up', 'secondary'],
          ['Close out', 'link'],
        ]);
      // Each key is named with the job's title (#593).
      await expect(
        page.getByRole('button', { name: 'Copy follow-up: Design Systems Lead' }),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Mark followed up: Design Systems Lead' }).click();
      const toast = page.getByRole('region', { name: /^Notifications/ });
      await expect(toast.getByText('Marked followed up: Design Systems Lead')).toBeVisible();
      // The focused key left with the state: focus is on the title, not the body.
      await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).toBe('H1');
      await toast.getByRole('button', { name: 'Undo' }).last().click();
      await expect.poll(() => ranks(page)).toContainEqual(['Copy follow-up', 'primary']);
    });

    test('no link: a fact says so; Mark applied is filled and Add link grey', async ({ page }) => {
      await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
      await seed(page);
      // A record with no usable link (as a sync or a backup can bring one).
      await page.evaluate(() => {
        const jobs = JSON.parse(localStorage.getItem('rjb_shortlist') || '[]');
        jobs.push({ url: 'notes:designer', label: 'Placeholder Designer', status: 'Saved' });
        localStorage.setItem('rjb_shortlist', JSON.stringify(jobs));
      });
      await page.reload();
      await openTitled(page, 'Placeholder Designer', width);
      await expect(page.getByText('No application link')).toBeVisible();
      await expect(page.getByRole('link', { name: /Open application/ })).toHaveCount(0);
      await expect
        .poll(() => ranks(page))
        .toEqual([
          ['Mark applied', 'primary'],
          ['Add link', 'secondary'],
          ['Not a fit', 'link'],
        ]);
    });
  });
}
