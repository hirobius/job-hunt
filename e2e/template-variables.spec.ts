import { test, expect, type Page } from '@playwright/test';

// #221: template variables are atomic chips, driven by keyboard only, at a phone and a desk width.
const SNIPPET = [{ id: 'tpl-x', label: 'Note', body: 'Hi [Contact], at [Company]' }];

async function open(page: Page) {
  await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  await page.addInitScript((s) => {
    if (!localStorage.getItem('rjb_copydeck_v1'))
      localStorage.setItem('rjb_copydeck_v1', JSON.stringify(s));
  }, SNIPPET);
  await page.goto('/#/copy-deck/tpl-x');
}
const stored = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('rjb_copydeck_v1') || '[]')[0]);

for (const width of [1440, 390]) {
  test(`keyboard only: step over, delete and insert chips (${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await open(page);
    const field = page.getByRole('textbox', { name: 'Snippet text' });
    await expect(page.getByRole('img', { name: 'Contact variable' })).toBeVisible();

    // Home, then 3 arrows reach the chip; one arrow steps over all of it; type after it.
    await field.focus();
    await page.keyboard.press('Control+Home');
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.type('!');
    await expect.poll(async () => (await stored(page)).body).toBe('Hi [Contact]!, at [Company]');

    // Backspace twice: the "!" then the whole chip.
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await expect.poll(async () => (await stored(page)).body).toBe('Hi , at [Company]');

    // Shift+Tab to Insert variable, open it, arrow to Role: it lands where the caret was.
    await page.keyboard.press('Shift+Tab');
    await expect(page.getByRole('button', { name: 'Insert variable' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menuitem', { name: 'Company' })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menuitem', { name: 'Role' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await stored(page)).body).toBe('Hi [Role], at [Company]');
    await expect(field).toBeFocused();
    await page.keyboard.type('X');
    await expect.poll(async () => (await stored(page)).body).toBe('Hi [Role]X, at [Company]');

    // Enter makes a plain new line.
    await page.keyboard.press('Enter');
    await page.keyboard.type('Bye');
    await expect.poll(async () => (await stored(page)).body).toBe('Hi [Role]X\nBye, at [Company]');
  });
}

test('a value set under Variables fills the preview', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  await page
    .getByRole('region', { name: 'Variables' })
    .getByRole('textbox', { name: 'Company' })
    .fill('Acme');
  await expect(page.getByRole('region', { name: 'Preview' })).toHaveText('Hi [Contact], at Acme');
  expect((await stored(page)).body).toBe('Hi [Contact], at [Company]');
});
