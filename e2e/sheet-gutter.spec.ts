import { test, expect, type Page } from '@playwright/test';

// Round-2 review alignment: the Add job and Search profile sheets keep the page's 16px phone gutter,
// and the lg Apply list column keeps its contents and focus rings inside its scroll box (#614).
async function sample(page: Page) {
  await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  await page.goto('/#/apply');
  await page.getByRole('button', { name: 'Try with sample data' }).click();
  // The first job (Proposal A: the tab is the job), with the list column beside it from lg (#471).
  await expect(page.getByRole('button', { name: 'Try with sample data' })).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).not.toHaveText('Apply');
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

// #614: the lg list column scrolls on its own, and its scroll box clipped the left edge of its
// contents and the focus rings of its header (Add job, the view chips, Remote only, Search, Sort).
test('the Apply list column at 1440: nothing starts left of its content box, no ring is clipped', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await sample(page);
  const rail = page.locator('.job-rail');
  await expect(rail).toBeVisible();
  const offenders = await rail.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const left = box.left + parseFloat(getComputedStyle(el).paddingLeft);
    return [...el.querySelectorAll<HTMLElement>('*')]
      .filter((n) => {
        const r = n.getBoundingClientRect();
        return r.width > 0 && r.left < left - 0.5;
      })
      .map((n) => `${n.tagName}.${n.className}`);
  });
  expect(offenders).toEqual([]);
  // Every control in the header, focused by keyboard: its ring (outline or box-shadow, plus its
  // offset) lies inside the scroll box, which clips at its padding edge.
  const controls = rail.locator(
    ':is(button, a, input, [role="switch"]):not(nav[aria-label="Jobs"] *)',
  );
  const n = await controls.count();
  expect(n).toBeGreaterThan(3);
  await page.keyboard.press('Tab');
  for (let i = 0; i < n; i++) {
    const c = controls.nth(i);
    if (!(await c.isVisible())) continue;
    await c.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    const clip = await c.evaluate(
      (node, railEl) => {
        const el = node as HTMLElement;
        const cs = getComputedStyle(el);
        const ring =
          (parseFloat(cs.outlineWidth) || 0) + Math.max(0, parseFloat(cs.outlineOffset) || 0);
        const shadow = cs.boxShadow
          .split(/,(?![^(]*\))/)
          .map((s) => s.match(/(-?[\d.]+)px/g)?.map(parseFloat) ?? [])
          .reduce((m, v) => Math.max(m, (v[3] ?? 0) + Math.max(0, v[2] ?? 0) / 2), 0);
        const grow = Math.max(ring, shadow);
        const r = el.getBoundingClientRect();
        const b = (railEl as HTMLElement).getBoundingClientRect();
        const st = (railEl as HTMLElement).scrollTop;
        return {
          name: el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 30),
          out:
            r.left - grow < b.left - 0.5 ||
            (st === 0 && r.top - grow < b.top - 0.5) ||
            r.right + grow > b.left + (railEl as HTMLElement).clientWidth + 0.5,
        };
      },
      await rail.elementHandle(),
    );
    expect(clip.out, `${clip.name} ring clipped`).toBe(false);
  }
});
