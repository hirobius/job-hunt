// The flame logo has one source: src/brand/flame.svg. Everything else derives from it (the header,
// the boot splash, the sign-in screen, and `npm run icons` for the favicon, PNGs and og-image).
// This fails on a second copy of the mark anywhere in the repo, or a favicon left stale.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { BRAND } from '../brand';
import { applyBrand } from '../brandHtml';
import { BrandLogo, Flame } from './Flame';
import { flameSvg, withUniqueIds } from './flameSvg';

afterEach(cleanup);

const SOURCE = 'src/brand/flame.svg';
// The only file allowed to hold the mark besides its source: written by `npm run icons`.
const GENERATED = 'public/favicon.svg';
const paths = (svg: string) => [...svg.matchAll(/\sd="([^"]+)"/g)].map((m) => m[1]);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (/^(node_modules|dist|\.git|gallery|test-results|playwright-report)$/.test(n)) return [];
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const repoFiles = ['src', 'scripts', 'e2e', 'public', 'api', 'docs']
  .filter((d) => existsSync(d))
  .flatMap(walk)
  .concat(['index.html', 'vite.config.ts'])
  .filter((f) => f !== SOURCE && f !== GENERATED);

describe('flame.svg, the one source', () => {
  const svg = readFileSync(SOURCE, 'utf8');

  it('is one svg with a viewBox and path data', () => {
    expect(svg.match(/<svg[\s>]/g)).toHaveLength(1);
    expect(svg).toMatch(/viewBox="[\d.\s-]+"/);
    expect(paths(svg).length).toBeGreaterThan(0);
  });

  it('is the module the app imports', () => {
    expect(flameSvg).toBe(svg);
  });

  it('fills only with HDS primitive colours (no stray hex)', () => {
    const vars = readFileSync('node_modules/@hirobius/design-system/dist/variables.css', 'utf8');
    const hds = new Set(
      [...vars.matchAll(/--primitive-color-[\w-]+:\s*(#[0-9a-f]{6})\b/gi)].map((m) =>
        m[1].toLowerCase(),
      ),
    );
    const fills = [...svg.matchAll(/#[0-9a-f]{3,8}\b/gi)].map((m) => m[0].toLowerCase());
    expect(fills.filter((f) => !hds.has(f))).toEqual([]);
  });
});

describe('no second logo', () => {
  it('no other svg file exists in the repo (public/favicon.svg is generated from flame.svg)', () => {
    expect(repoFiles.filter((f) => f.endsWith('.svg'))).toEqual([]);
  });

  it('no other file carries flame path data or an inline drawn svg', () => {
    const marks = paths(readFileSync(SOURCE, 'utf8')).map((d) => d.slice(0, 40));
    const longPath = /\bd=["'{`]+\s*[Mm][\d\s.,LlMmCcQqAaHhVvSsTtZz-]{60,}/;
    const offenders = repoFiles
      .filter((f) => /\.(tsx?|m?js|css|html|json|md)$/.test(f))
      .filter((f) => f !== 'src/brand/flame.test.tsx')
      .filter((f) => {
        const text = readFileSync(f, 'utf8');
        // docs/ hold design explorations with UI icons: only a copy of the flame counts there.
        return (
          marks.some((m) => text.includes(m)) || (!f.startsWith('docs') && longPath.test(text))
        );
      });
    expect(offenders).toEqual([]);
  });

  it('the old procedural flame engine is gone', () => {
    expect(existsSync('src/components/brand')).toBe(false);
  });
});

describe('derived from flame.svg', () => {
  const source = paths(readFileSync(SOURCE, 'utf8'));

  it('public/favicon.svg holds the current flame (else run `npm run icons`)', () => {
    const favicon = readFileSync(GENERATED, 'utf8');
    for (const d of source) expect(favicon).toContain(d);
    expect(/aria-label="([^"]*)"/.exec(favicon)?.[1]).toBe(BRAND.name);
  });

  it('the boot splash in index.html is the flame, inside #root', () => {
    const html = applyBrand(readFileSync('index.html', 'utf8'));
    const root = /<div id="root">([\s\S]*?)<\/div>\s*<script/.exec(html)?.[1] ?? '';
    expect(root).toMatch(/class="rjb-boot"/);
    expect(root).toMatch(/role="status"/);
    expect(root).toContain(`aria-label="Loading ${BRAND.name}"`);
    for (const d of source) expect(root).toContain(d);
  });

  it('the header lockup is the wordmark (an image, not a heading: #363), the flame from flame.svg as its "o"', () => {
    const { container } = render(<BrandLogo />);
    const word = screen.getByRole('img', { name: BRAND.name });
    const flame = word.querySelector('.rjb-wordmark-o .rjb-flame')!;
    expect(flame.closest('[aria-hidden="true"]')).not.toBeNull();
    expect([...flame.querySelectorAll('path')].map((p) => p.getAttribute('d'))).toEqual(source);
    expect(container.querySelector('img, canvas')).toBeNull();
  });

  it('two flames on one page never share an id', () => {
    const { container } = render(
      <>
        <Flame />
        <Flame reveal />
      </>,
    );
    const ids = [...container.querySelectorAll('[id]')].map((e) => e.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    for (const use of container.querySelectorAll('use')) {
      expect(ids).toContain(use.getAttribute('href')!.slice(1));
    }
  });

  it('withUniqueIds handles single quotes and quoted url() references', () => {
    const out = withUniqueIds(
      `<svg><clipPath id='c'/><g clip-path="url('#c')"/><use href='#c'/></svg>`,
      'z',
    );
    expect(out).toBe(
      `<svg><clipPath id='c-z'/><g clip-path="url('#c-z')"/><use href='#c-z'/></svg>`,
    );
  });

  it('withUniqueIds rewrites ids and their references, and drops comments', () => {
    const out = withUniqueIds(
      '<!-- note --><svg><clipPath id="c"><use href="#p"/></clipPath><path id="p" clip-path="url(#c)"/></svg>',
      'x1',
    );
    expect(out).toBe(
      '<svg><clipPath id="c-x1"><use href="#p-x1"/></clipPath><path id="p-x1" clip-path="url(#c-x1)"/></svg>',
    );
  });
});

describe('the reveal', () => {
  it('uses HDS motion tokens only and is still under prefers-reduced-motion', () => {
    const css = readFileSync('src/theme/base.css', 'utf8');
    const reveal = /\.rjb-flame-reveal svg\s*\{([^}]*)\}/.exec(css)![1];
    expect(reveal).toMatch(/animation:[^;]*var\(--hds-motion-[\w-]+-duration\)/);
    expect(reveal).not.toMatch(/\d+m?s\b/);
    const boot = /\.rjb-boot\s*\{([^}]*)\}/.exec(css)![1];
    expect(boot).not.toMatch(/\d+m?s\b/);
    const reduced = [...css.matchAll(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/g)]
      .map((m) => m[1])
      .join('\n');
    expect(reduced).toMatch(/\.rjb-flame-reveal/);
    // reduced motion drops the fade, never the beat that keeps a fast boot from flashing
    expect(reduced).toMatch(/\.rjb-boot\s*\{\s*animation-timing-function: step-end/);
  });
});
