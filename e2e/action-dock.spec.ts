import { test, expect, type Page } from '@playwright/test';
import { seed, topTab } from './routes';

// The job's action dock (#535) and Not a fit as an exit with Undo (#536).
const dockOf = (page: Page) => page.getByRole('group', { name: /^Actions for / });

async function openToApply(page: Page) {
  await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  await seed(page);
  await page.goto('/#/apply');
  await expect(dockOf(page)).toBeVisible();
}

async function keyRanks(page: Page) {
  return dockOf(page)
    .locator('a, button')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-variant')));
}

test.describe('dock 390', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the keys sit in a dock at the bottom, ranked, 44px; it hides while a field has focus', async ({
    page,
  }) => {
    await openToApply(page);
    const dock = dockOf(page);
    expect(await keyRanks(page)).toEqual(['primary', 'secondary', 'link']);
    expect(await dock.evaluate((e) => getComputedStyle(e).position)).toBe('fixed');
    const box = (await dock.boundingBox())!;
    expect(Math.round(box.y + box.height)).toBe(844);
    for (const k of await dock.locator('a, button').all()) {
      const b = (await k.boundingBox())!;
      expect(b.height).toBeGreaterThanOrEqual(44);
      await expect(k).toHaveAccessibleName(/\S/);
    }
    // A field takes focus: the dock leaves; on blur it comes back.
    const notes = page.getByRole('textbox').last();
    await notes.focus();
    await expect(page.locator('.rjb-dock')).toHaveAttribute('data-hidden', 'true');
    await expect(async () => {
      const b = (await page.locator('.rjb-dock').boundingBox())!;
      expect(b.y).toBeGreaterThanOrEqual(844 - 1);
    }).toPass();
    // Moving from one field to the next does not bring the dock back between them.
    await page.evaluate(() => {
      const d = document.querySelector('.rjb-dock')!;
      (window as unknown as { seen: string[] }).seen = [];
      new MutationObserver(() =>
        (window as unknown as { seen: string[] }).seen.push(d.getAttribute('data-hidden')!),
      ).observe(d, { attributes: true, attributeFilter: ['data-hidden'] });
    });
    const fields = page.getByRole('textbox');
    if ((await fields.count()) > 1) {
      await fields.first().focus();
      await notes.focus();
      await page.waitForTimeout(300);
      expect(
        await page.evaluate(() => (window as unknown as { seen: string[] }).seen),
      ).not.toContain('false');
    }
    await notes.blur();
    await expect(dockOf(page)).toHaveAttribute('data-hidden', 'false');
  });

  test('Not a fit: moves on, a toast with Undo by keyboard, Undo restores the job', async ({
    page,
  }) => {
    await openToApply(page);
    const title = (await page.getByRole('heading', { level: 1 }).textContent())!.trim();
    await dockOf(page)
      .getByRole('button', { name: `Not a fit: ${title}` })
      .click();
    // Focus moves to the next job's title.
    await expect(page.getByRole('heading', { level: 1 })).not.toHaveText(title);
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.matches('h1') ?? false))
      .toBe(true);
    const toast = page.getByText(`Marked not a fit: ${title}`).first();
    await expect(toast).toBeVisible();
    // The toast sits above the dock, never over its keys.
    const undoBox = (await page.getByRole('button', { name: 'Undo' }).boundingBox())!;
    const dockBox = (await page.locator('.rjb-dock').boundingBox())!;
    expect(undoBox.y + undoBox.height).toBeLessThanOrEqual(dockBox.y + 1);
    const next = (await page.getByRole('heading', { level: 1 }).textContent())!.trim();
    const count = async () =>
      Number(
        (await page.getByRole('navigation', { name: 'Jobs in the list' }).textContent())!.match(
          /of (\d+)/,
        )![1],
      );
    const shorter = await count();
    // The toast survives navigation for its full timeout (interaction review 2026-11-11).
    await topTab(page, 'Find').click();
    await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
    await page.goBack();
    const undo = page.getByRole('button', { name: 'Undo' });
    await undo.focus();
    await page.keyboard.press('Enter');
    // Undo restores the job in its place and does not navigate.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(next);
    await expect.poll(count).toBe(shorter + 1);
  });
});

test.describe('dock 1440', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('the same keys sit in one row under the title block', async ({ page }) => {
    await openToApply(page);
    const dock = dockOf(page);
    expect(await keyRanks(page)).toEqual(['primary', 'secondary', 'link']);
    expect(await dock.evaluate((e) => getComputedStyle(e).position)).not.toBe('fixed');
    const keys = await dock.locator('a, button').all();
    const ys = await Promise.all(keys.map(async (k) => Math.round((await k.boundingBox())!.y)));
    expect(new Set(ys).size).toBe(1);
    const facts = (await page.locator('[data-rjb-title-block] ul').boundingBox())!;
    expect(ys[0]).toBeGreaterThan(facts.y);
  });
});
