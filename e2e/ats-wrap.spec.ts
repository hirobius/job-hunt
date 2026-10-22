import { test, expect } from '@playwright/test';

// ATS search at 390 (round-2 review): a board list's name ("Freelance, startup and remote …") and
// its one-line description wrap instead of being cut with an ellipsis.
test('ATS search row titles and descriptions wrap at 390', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  await page.goto('/#/discover');
  await page.getByRole('group', { name: 'Starter tracks' }).getByRole('checkbox').first().check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Finish' }).click();
  await page.goto('/#/discover/ats');
  const row = page.getByRole('button', { name: /^Freelance, startup and remote/ });
  await expect(row).toBeVisible();
  // No text inside a row is cut: every element's text fits its box, and none is set to ellipsis.
  const cut = await row.evaluate((btn) =>
    [btn, ...btn.querySelectorAll('*')]
      .filter(
        (e) =>
          e.childNodes.length &&
          [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim()),
      )
      .filter((e) => {
        const cs = getComputedStyle(e);
        return (
          cs.textOverflow === 'ellipsis' ||
          cs.webkitLineClamp !== 'none' ||
          e.scrollWidth > e.clientWidth + 1
        );
      })
      .map((e) => e.textContent),
  );
  expect(cut).toEqual([]);
});
