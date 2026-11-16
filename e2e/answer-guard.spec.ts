// The double-tap guard (answerGuard.ts) swallows presses in the page for 700 ms after an answer,
// because the next job's controls render under the finger. A control that stays where it was opts
// out (#591): on a phone the job's pager does not move when Mark applied opens the next job, so a
// press on its Next right after is deliberate and moves on at once.
import { test, expect } from './fixtures';
import { go, seed } from './routes';

test.use({ viewport: { width: 390, height: 844 } });

test('right after Mark applied, the pager still answers (#591)', async ({ page }) => {
  await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  await seed(page);
  // Enough jobs to apply to that the pager has a Next after one is answered.
  await page.evaluate(async () => {
    const store = await import('/src/store.ts');
    for (const n of [1, 2, 3])
      store.addJob(`https://boards.greenhouse.io/guard/jobs/${n}`, `Design Systems Lead ${n}`);
  });
  await go(page, '#/apply');
  const h1 = page.getByRole('heading', { level: 1 });
  const first = (await h1.textContent())!.trim();
  await page
    .getByRole('button', { name: /^Mark applied/ })
    .first()
    .click();
  await expect(h1).not.toHaveText(first);
  const second = (await h1.textContent())!.trim();
  // Inside the guard's 700 ms: the pager's Next is not swallowed.
  await page
    .getByRole('navigation', { name: 'Jobs in the list' })
    .getByRole('button', { name: /next/i })
    .click();
  await expect(h1).not.toHaveText(second, { timeout: 600 });
});
