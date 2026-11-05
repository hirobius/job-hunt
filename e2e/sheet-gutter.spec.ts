import { test, expect, type Page } from '@playwright/test';

// Round-2 review alignment: the Add job and Search profile sheets keep the page's 16px phone gutter,
// and the Pipeline's tertiary "Check which are still open" starts on the Jobs panel's content edge.
async function sample(page: Page) {
  await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  await page.goto('/#/queue');
  await page.getByRole('button', { name: 'Try with sample data' }).click();
  // The Jobs panel, or from lg the list column beside the first job (#471).
  await expect(page.getByRole('textbox', { name: /^Search (saved )?jobs$/ })).toBeVisible();
}

async function expectGutter(page: Page) {
  const box = (await page.getByRole('dialog').boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(16 - 0.5);
  expect(box.x + box.width).toBeLessThanOrEqual(390 - 16 + 0.5);
}

test('Add job and Search profile sheets keep a side gutter at 390', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await sample(page);
  await page.getByRole('button', { name: 'Add job' }).click();
  await expect(page.getByRole('dialog', { name: 'Add a job' })).toBeVisible();
  await expectGutter(page);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Account' }).click();
  await page.getByRole('menuitem', { name: 'Search profile' }).click();
  await expect(page.getByRole('dialog', { name: 'Search profile' })).toBeVisible();
  await expectGutter(page);
});

for (const width of [390, 1440]) {
  test(`"Check which are still open" starts on the Jobs panel's content edge (${width})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await sample(page);
    // A board job (Greenhouse) is what the liveness check reads.
    await page.goto('/?add=' + encodeURIComponent('https://boards.greenhouse.io/acme/jobs/123'));
    await page.evaluate(() => (location.hash = '#/queue'));
    const check = page.getByRole('button', { name: 'Check which are still open' });
    await expect(check).toBeVisible();
    const textLeft = await check.evaluate((b) => {
      const r = document.createRange();
      r.selectNodeContents(b);
      return r.getBoundingClientRect().left;
    });
    // The search field (the panel's first content) is the bordered input itself.
    // From lg it is the list column's search beside the job (#471).
    const edge = (await page
      .getByRole('textbox', { name: /^Search (saved )?jobs$/ })
      .boundingBox())!.x;
    expect(Math.abs(textLeft - edge)).toBeLessThanOrEqual(1);
  });
}
