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
import { FLAME, FLAME_FRAMES, loopFrames } from './flameEngine';

afterEach(cleanup);

const SOURCE = 'src/brand/flame.svg';
// The only file allowed to hold the mark besides its source: written by `npm run icons`.
const GENERATED = 'public/favicon.svg';
// Third-party marks a brand's own rules require as given (never the flame, never a UI icon: those
// are HDS Icons). Google's "G" for Continue with Google (#482, Google's sign-in branding rules).
const THIRD_PARTY_MARKS = ['src/account/google-g.svg'];
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
    expect(repoFiles.filter((f) => f.endsWith('.svg') && !THIRD_PARTY_MARKS.includes(f))).toEqual(
      [],
    );
    // The allowed marks carry no flame path data.
    const marks = paths(readFileSync(SOURCE, 'utf8')).map((d) => d.slice(0, 40));
    for (const f of THIRD_PARTY_MARKS) {
      const text = readFileSync(f, 'utf8');
      expect(marks.some((m) => text.includes(m))).toBe(false);
    }
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

  it('the header lockup is the wordmark (an image, not a heading: #363), the flame from flame.svg before the word', () => {
    const { container } = render(<BrandLogo />);
    const word = screen.getByRole('img', { name: BRAND.name });
    const flame = word.querySelector('.rjb-wordmark-flame .rjb-flame')!;
    expect(flame.closest('[aria-hidden="true"]')).not.toBeNull();
    // A layer that is switched off has an empty path.
    expect(
      [...flame.querySelectorAll('path')].map((p) => p.getAttribute('d')).filter(Boolean),
    ).toEqual(source);
    expect(container.querySelector('img, canvas')).toBeNull();
  });

  it('two flames on one page never share an id', () => {
    const { container } = render(
      <>
        <Flame />
        <Flame animate />
      </>,
    );
    // The flame's layers stack with no clip, so today it has no ids at all; if one comes back,
    // withUniqueIds keeps them apart.
    const ids = [...container.querySelectorAll('[id]')].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(container.querySelectorAll('svg')).toHaveLength(2);
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

describe('the boot splash moves (a baked loop)', () => {
  const html = applyBrand(readFileSync('index.html', 'utf8'));
  const root = /<div id="root">([\s\S]*?)<\/div>\s*<script/.exec(html)?.[1] ?? '';
  const frames = [...root.matchAll(/<g class="rjb-boot-f"([^>]*)>([\s\S]*?)<\/g>/g)];
  const css = readFileSync('src/theme/base.css', 'utf8');

  it('holds the engine’s loop, one group per frame, the first shown and the rest hidden', () => {
    expect(frames).toHaveLength(FLAME_FRAMES);
    const loop = loopFrames(FLAME);
    frames.forEach(([, attrs, body], k) => {
      for (const d of loop[k]) expect(body).toContain(`d="${d}"`);
      expect(body).not.toMatch(/clip/);
      expect(attrs.includes('visibility="hidden"')).toBe(k > 0);
      expect(attrs).toContain(`animation-delay:${(k * 1000) / FLAME.fps}ms`);
    });
    const ids = [...root.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(root).toContain(`--rjb-flame-loop:${(FLAME_FRAMES * 1000) / FLAME.fps}ms`);
  });

  it('steps through the frames at the engine’s fps (one slot each), still under reduced motion', () => {
    const rule = /\.rjb-boot-f\s*\{([^}]*)\}/.exec(css)![1];
    expect(rule).toMatch(/animation:\s*rjb-boot-frame var\(--rjb-flame-loop\) step-end infinite/);
    const keys = /@keyframes rjb-boot-frame\s*\{([\s\S]*?)\n\}/.exec(css)![1];
    expect(keys).toContain(`${100 / FLAME_FRAMES}%`);
    const reduced = [...css.matchAll(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/g)]
      .map((m) => m[1])
      .join('\n');
    expect(reduced).toMatch(/\.rjb-boot-f\s*\{\s*animation: none/);
    // reduced motion drops the fade, never the beat that keeps a fast boot from flashing
    expect(reduced).toMatch(/\.rjb-boot\s*\{\s*animation-timing-function: step-end/);
    const boot = /\.rjb-boot\s*\{([^}]*)\}/.exec(css)![1];
    expect(boot).not.toMatch(/\d+m?s\b/);
  });

  it('the old rise-in reveal is gone', () => {
    expect(css).not.toMatch(/rjb-flame-reveal/);
    expect(readFileSync('index.html', 'utf8')).not.toMatch(/rjb-flame-reveal/);
  });
});
