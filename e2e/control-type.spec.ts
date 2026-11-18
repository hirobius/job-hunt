// One type treatment for controls (Adrian 2026-11-18, Apply at 390: the view picker's name was
// bold, 700, beside keys at 600). The app sets no weight of its own on a control: an HDS Button's
// label computes HDS's Button weight (`--component-button-fontWeight`) at the HDS ui or caption
// size, and the top tabs compute the HDS ui weight, as HDS SegmentedControl does. That HDS has two
// weights for controls is an upstream ask (docs/hds-upstream-asks-0.9.md), not patched here.
// Local only: `npm run test:e2e`.
import { test, expect, type Page } from './fixtures';
import { seed, go } from './routes';

/** One line per control whose label does not compute the weight HDS gives its kind. */
function wrongWeights(page: Page) {
  return page.evaluate(() => {
    // What a token computes to, read from a probe element.
    const probe = document.createElement('span');
    document.body.appendChild(probe);
    const weightOf = (token: string) => {
      probe.style.fontWeight = `var(${token})`;
      return getComputedStyle(probe).fontWeight;
    };
    const button = weightOf('--component-button-fontWeight');
    const ui = weightOf('--semantic-typography-ui-font-weight');
    probe.remove();
    const out: string[] = [];
    const label = (el: Element) => {
      // The element that holds the label's text.
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode())
        if ((n.textContent ?? '').trim()) return n.parentElement!;
      return null;
    };
    const check = (el: Element, want: string, kind: string) => {
      if (!el.getClientRects().length) return;
      const text = label(el);
      if (!text) return; // an icon-only key
      // A count beside the label (a Badge) has its own type.
      if (text.closest('[data-tone]') && text !== el) return;
      const got = getComputedStyle(text).fontWeight;
      if (got !== want)
        out.push(`${kind} "${(el.textContent ?? '').trim().slice(0, 30)}": ${got}, not ${want}`);
    };
    for (const el of document.querySelectorAll('header [data-variant], main [data-variant]'))
      if (el.matches('button, a')) check(el, button, 'Button');
    for (const el of document.querySelectorAll('.rjb-seg')) check(el, ui, 'top tab');
    return { out, button, ui };
  });
}

for (const width of [390, 1440] as const)
  test.describe(`control type ${width}`, () => {
    test.use({ viewport: { width, height: width > 600 ? 900 : 844 } });

    test('no control sets a weight of its own', async ({ page }) => {
      await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
      await seed(page);
      const bad: string[] = [];
      for (const hash of ['#/apply', '#/review', '#/apply/company/larkspur-analytics']) {
        await go(page, hash);
        const found = await wrongWeights(page);
        // The two HDS weights are real numbers (the tokens resolve).
        expect(Number(found.button)).toBeGreaterThan(0);
        expect(Number(found.ui)).toBeGreaterThan(0);
        bad.push(...found.out.map((s) => `${hash}: ${s}`));
      }
      expect(bad).toEqual([]);
    });
  });

// Pause and Play are solid glyphs wherever they show (Adrian 2026-11-18): the sign-in screen's key
// and the Account menu's row. HDS `Icon weight="fill"` leaves the shape an outline, so
// `.rjb-icon-solid` (late.css) fills it; the key keeps its 44px target and its name.
test.describe('Pause and Play are solid glyphs', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  const filled = (page: Page, scope: string) =>
    page.evaluate((scope) => {
      const svg = document.querySelector(`${scope} svg.rjb-icon-solid`);
      const shape = svg?.querySelector('rect, polygon, path');
      return shape ? getComputedStyle(shape).fill : 'no icon';
    }, scope);

  test('the sign-in screen: Pause, then Play', async ({ page }) => {
    await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
    // The sign-in screen opens on its own over a signed-out Review.
    await page.addInitScript(() => sessionStorage.removeItem('rjb_sign_in_asked'));
    await page.goto('/#/review');
    const key = page.locator('.rjb-signin-screen__motion button');
    await expect(key).toHaveAccessibleName('Pause animations');
    expect(await filled(page, '.rjb-signin-screen__motion')).toMatch(/^rgb/);
    const box = (await key.boundingBox())!;
    expect(Math.round(box.width)).toBeGreaterThanOrEqual(44);
    expect(Math.round(box.height)).toBeGreaterThanOrEqual(44);
    await key.click();
    await expect(key).toHaveAccessibleName('Play animations');
    expect(await filled(page, '.rjb-signin-screen__motion')).toMatch(/^rgb/);
  });

  test('the Account menu row', async ({ page }) => {
    await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
    await seed(page);
    await page.getByRole('button', { name: /^Account/ }).click();
    const row = page.getByRole('menuitemcheckbox', { name: /Pause animations/ });
    await expect(row).toBeVisible();
    expect(await filled(page, '[role=menu]')).toMatch(/^rgb/);
  });
});
