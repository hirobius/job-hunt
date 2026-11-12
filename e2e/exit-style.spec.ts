import { test, expect, type Locator, type Page } from '@playwright/test';
import { listScope, seed } from './routes';

// The exit (#537, redesign §3): every way out is HDS Button variant="link": underlined, the
// primary text colour, no fill, no ledge, and a 44px hit area at every width. Never blue.
async function expectExit(exit: Locator) {
  await expect(exit).toBeVisible();
  await expect(exit).toHaveAttribute('data-variant', 'link');
  const s = await exit.evaluate((el) => {
    const cs = getComputedStyle(el);
    const probe = document.createElement('span');
    probe.style.color = 'var(--semantic-color-content-primary)';
    el.parentElement!.append(probe);
    const primary = getComputedStyle(probe).color;
    probe.remove();
    const r = el.getBoundingClientRect();
    return {
      line: cs.textDecorationLine,
      color: cs.color,
      primary,
      bg: cs.backgroundColor,
      shadow: cs.boxShadow,
      w: r.width,
      h: r.height,
    };
  });
  expect(s.line).toContain('underline');
  expect(s.color).toBe(s.primary);
  expect(s.bg).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
  expect(s.shadow).toBe('none');
  expect(s.h).toBeGreaterThanOrEqual(44);
  expect(s.w).toBeGreaterThanOrEqual(44);
}

async function openSignIn(page: Page) {
  await page.goto('/#/apply');
  await page.getByRole('button', { name: /^Account/ }).click();
  await page.getByRole('menuitem', { name: /^Sign in/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Sign in' });
  await expect(dialog).toBeVisible();
  return dialog;
}

for (const width of [390, 1440]) {
  test.describe(`exits ${width}`, () => {
    test.use({ viewport: { width, height: width === 390 ? 844 : 900 } });

    test('Continue without an account is an exit', async ({ page }) => {
      const dialog = await openSignIn(page);
      await expectExit(dialog.getByRole('button', { name: 'Continue without an account' }));
    });

    test('Not a fit and Cancel are exits', async ({ page }) => {
      await seed(page);
      await page.goto('/#/apply');
      await expectExit(page.getByRole('button', { name: /^Not a fit: / }).first());
      // Add job is the list's (#543): the All jobs sheet below lg.
      await (await listScope(page)).getByRole('button', { name: 'Add job' }).click();
      const add = page.getByRole('dialog', { name: 'Add a job' });
      await expectExit(add.getByRole('button', { name: 'Cancel' }));
    });
  });
}
