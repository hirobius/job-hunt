import { test, expect, type Page } from '@playwright/test';
import { seed } from './routes';

// Copy into the form (#539): each filled field is a flat Tag chip with a copy icon. A press
// copies and says "Copied", also to screen readers. Empty fields fold into one line. A failed
// copy shows the text in a toast to copy by hand (interaction review 2026-11-11).
test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

async function addName(page: Page) {
  await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  await seed(page);
  await page.goto('/#/apply');
  const kit = page.getByRole('region', { name: 'Copy into the form' });
  await expect(kit.getByText(/^\d+ more fields are empty\./)).toBeVisible();
  await kit.getByRole('button', { name: 'Add them' }).click();
  await kit.getByRole('button', { name: 'Add Name' }).click();
  await kit.getByRole('textbox', { name: 'Name' }).fill('Sam Placeholder');
  await kit.getByRole('button', { name: 'Done', exact: true }).click();
  return kit;
}

for (const width of [390, 1440]) {
  test.describe(`copy chips ${width}`, () => {
    test.use({ viewport: { width, height: width === 390 ? 844 : 900 } });

    test('a filled field is a flat chip; a press copies and says Copied', async ({ page }) => {
      const kit = await addName(page);
      const chip = kit.getByRole('button', { name: 'Copy Name' });
      await expect(chip).toBeVisible();
      await expect(chip).not.toHaveAttribute('data-variant', /.+/);
      await expect(chip.locator('svg')).toHaveCount(1);
      // No ledge: a chip is not a keycap.
      expect(await chip.evaluate((e) => getComputedStyle(e).boxShadow)).toBe('none');
      expect((await chip.boundingBox())!.height).toBeGreaterThanOrEqual(width === 390 ? 44 : 24);
      await chip.click();
      // The name stays "Copy Name"; the status alone says "Copied Name", so it is said once.
      await expect(chip).toHaveText('Copied');
      await expect(chip).not.toHaveAttribute('aria-pressed', /.*/);
      await expect(kit.getByRole('status').filter({ hasText: 'Copied Name' })).toHaveCount(1);
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('Sam Placeholder');
    });

    test('a failed copy shows the text in a toast to copy by hand', async ({ page }) => {
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'clipboard', {
          value: { writeText: () => Promise.reject(new Error('denied')) },
        });
      });
      const kit = await addName(page);
      await kit.getByRole('button', { name: 'Copy Name' }).click();
      const toast = page.getByRole('region', { name: /^Notifications/ });
      await expect(toast.getByText(/^Couldn’t copy Name\./)).toBeVisible();
      await expect(toast.getByText('Sam Placeholder')).toBeVisible();
    });
  });
}
