import { test, expect } from '@playwright/test';

// Companies doesn't jump on arrival (perf, 2026-10-27): the watched boards read on arrival show as
// "checking" from the first paint, so the panel isn't drawn first with "Check open roles" and no
// rows, then pushed down (CLS was 0.44 on a phone, from that alone). Board reads are held open
// here, so rows reordering as boards answer (by design) doesn't count.
test('Companies at 390: no layout shift while its boards are read', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // Board reads are never answered (they stay in flight); everything else outside is aborted.
  await page.route(/^https?:\/\/(?!localhost)/, (r) => {
    if (
      !/greenhouse|lever|ashby|workable|recruitee|smartrecruiters|teamtailor|personio/.test(
        r.request().url(),
      )
    )
      return r.abort();
  });
  await page.goto('/#/discover', { waitUntil: 'domcontentloaded' });
  // The Suggested starter pack files its boards into Watched companies.
  await page.getByRole('group', { name: 'Starter tracks' }).getByRole('checkbox').first().check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Finish' }).click();
  await expect(page.getByRole('region', { name: 'Watched' })).toBeVisible();

  await page.addInitScript(() => {
    const w = window as unknown as { __cls: number };
    w.__cls = 0;
    new PerformanceObserver((l) => {
      for (const e of l.getEntries() as unknown as { value: number; hadRecentInput: boolean }[])
        if (!e.hadRecentInput) w.__cls += e.value;
    }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  const list = page.getByRole('list', { name: 'Companies' });
  await expect(list.getByText(/checking open roles/).first()).toBeVisible();
  await page.waitForTimeout(1000);
  const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
  expect(cls).toBeLessThan(0.1);
});
