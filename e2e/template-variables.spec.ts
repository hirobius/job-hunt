import { test, expect, type Page } from '@playwright/test';

// #221 on the Documents library (#227): an Outreach message's variables are atomic chips, driven
// by keyboard only, at a phone and a desk width. The text is a draft until Save; the preview shows
// the draft with no job picked, so it reads back exactly what the field holds.
const NOW = '2026-10-01T00:00:00.000Z';
const DOCS = [
  {
    id: 'msg-x',
    kind: 'outreach',
    title: 'Note',
    base: true,
    createdAt: NOW,
    versions: [{ id: 'v1', text: 'Hi [Contact], at [Company]', savedAt: NOW }],
  },
];

async function open(page: Page) {
  await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  await page.addInitScript((d) => {
    if (!localStorage.getItem('rjb_documents'))
      localStorage.setItem('rjb_documents', JSON.stringify(d));
  }, DOCS);
  await page.goto('/#/copy-deck/msg-x');
}
const preview = (page: Page) => page.getByRole('region', { name: 'Preview' });
const stored = (page: Page) =>
  page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('rjb_documents') || '[]').find(
      (x: { id: string }) => x.id === 'msg-x',
    );
    return d as { values?: Record<string, string>; versions: { text: string }[] };
  });

for (const width of [1440, 390]) {
  test(`keyboard only: step over, delete and insert chips (${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await open(page);
    const field = page.getByRole('textbox', { name: 'Message text' });
    await expect(page.getByRole('img', { name: 'Contact variable' })).toBeVisible();

    // Home, then 3 arrows reach the chip; one arrow steps over all of it; type after it.
    await field.focus();
    await page.keyboard.press('Control+Home');
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.type('!');
    await expect(preview(page)).toHaveText('Hi [Contact]!, at [Company]');

    // Backspace twice: the "!" then the whole chip.
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await expect(preview(page)).toHaveText('Hi , at [Company]');

    // Shift+Tab to Insert variable, open it, arrow to Role: it lands where the caret was.
    await page.keyboard.press('Shift+Tab');
    await expect(page.getByRole('button', { name: 'Insert variable' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menuitem', { name: 'Company' })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menuitem', { name: 'Role' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(preview(page)).toHaveText('Hi [Role], at [Company]');
    await expect(field).toBeFocused();
    await page.keyboard.type('X');
    await expect(preview(page)).toHaveText('Hi [Role]X, at [Company]');

    // Enter makes a plain new line.
    await page.keyboard.press('Enter');
    await page.keyboard.type('Bye');
    await expect(preview(page)).toHaveText('Hi [Role]X\nBye, at [Company]');

    // Save keeps it as a new Version; the first stays readable.
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect
      .poll(async () => (await stored(page)).versions.map((v) => v.text))
      .toEqual(['Hi [Contact], at [Company]', 'Hi [Role]X\nBye, at [Company]']);
  });
}

test('a value set under Variables fills the preview and is kept on the message', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  await page
    .getByRole('region', { name: 'Variables' })
    .getByRole('textbox', { name: 'Company' })
    .fill('Acme');
  await expect(preview(page)).toHaveText('Hi [Contact], at Acme');
  await expect.poll(async () => (await stored(page)).values).toEqual({ company: 'Acme' });
  expect((await stored(page)).versions.map((v) => v.text)).toEqual(['Hi [Contact], at [Company]']);
});
