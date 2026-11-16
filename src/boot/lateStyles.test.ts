import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { lateCssHtml, lateStyles } from './lateStyles';

describe('late stylesheets (Adrian 2026-11-15: no white page on a cold load)', () => {
  it("turns the entry's stylesheet links into preloads the app turns on", () => {
    const html = `<link rel="stylesheet" href="/boot.css" />
<link rel="stylesheet" crossorigin href="/assets/vendor-abc.css">
<link rel="stylesheet" href="/assets/index-def.css">`;
    expect(lateCssHtml(html)).toBe(`<link rel="stylesheet" href="/boot.css" />
<link rel="preload" as="style" crossorigin href="/assets/vendor-abc.css" data-rjb-css>
<link rel="preload" as="style" href="/assets/index-def.css" data-rjb-css>`);
  });

  it('mounts only once every app stylesheet is in, and a failed one does not hold it', async () => {
    document.head.innerHTML = `<link rel="preload" as="style" href="/assets/a.css" data-rjb-css>
<link rel="preload" as="style" href="/assets/b.css" data-rjb-css>`;
    let done = false;
    const ready = lateStyles().then(() => (done = true));
    const sheets = [...document.head.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')];
    expect(sheets.map((s) => new URL(s.href).pathname)).toEqual(['/assets/a.css', '/assets/b.css']);
    sheets[0].dispatchEvent(new Event('load'));
    await Promise.resolve();
    expect(done).toBe(false);
    sheets[1].dispatchEvent(new Event('error'));
    await ready;
    expect(done).toBe(true);
    document.head.innerHTML = '';
  });

  it('boot.css is the one render-blocking stylesheet and paints the page colour of each theme', () => {
    const index = readFileSync('index.html', 'utf8');
    expect(index).toMatch(/<link rel="stylesheet" href="\/boot\.css" \/>/);
    const boot = readFileSync('public/boot.css', 'utf8');
    // The theme-color metas' colours: HDS surface-page in each scheme.
    const metas = [...index.matchAll(/name="theme-color" content="(#[0-9a-f]+)"/g)].map(
      (m) => m[1],
    );
    expect(boot).toMatch(new RegExp(`html \\{\\s*background: ${metas[0]};`));
    expect(boot).toMatch(new RegExp(`html\\[data-theme='dark'\\] \\{\\s*background: ${metas[1]};`));
    expect(readFileSync('vite.config.ts', 'utf8')).toMatch(/name: 'late-css'/);
    expect(readFileSync('src/main.tsx', 'utf8')).toMatch(/lateStyles\(\)/);
  });
});
