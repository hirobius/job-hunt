// The cobalt flame beside the wordmark (Adrian 2026-10-22): pure SVG + CSS, decorative, still under
// reduced motion. The icons and the share image draw the same flame (scripts/make-icons.mjs).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { BrandMark } from './BrandMark';
import { FLAME, flameCss, flameSvg } from './flameMark';
import { hdsColor } from './hdsColor';
import { BRAND } from './brand';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('BrandMark', () => {
  it('is one decorative SVG: aria-hidden, no title, no raster', () => {
    const { container } = render(<BrandMark />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('focusable')).toBe('false');
    expect(container.querySelector('title, image, img, canvas, video')).toBeNull();
    // Licking tongues (outer → core), rising embers, a glow at the base.
    expect(svg.querySelectorAll('.rjb-flame-tongue')).toHaveLength(FLAME.tongues.length);
    expect(svg.querySelectorAll('.rjb-flame-ember').length).toBeGreaterThanOrEqual(2);
    expect(svg.querySelector('.rjb-flame-glow')).not.toBeNull();
  });

  it('gives each instance its own gradient and filter ids', () => {
    const { container } = render(
      <>
        <BrandMark />
        <BrandMark />
      </>,
    );
    const ids = [...container.querySelectorAll('[id]')].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('animates only with CSS, and only when motion is allowed', () => {
    const css = flameCss();
    // No SMIL: CSS is what reduced motion and the screenshot runs can stop.
    const { container } = render(<BrandMark />);
    expect(container.querySelector('animate, animateTransform, animateMotion, set')).toBeNull();
    const motion = css.indexOf('@media (prefers-reduced-motion: no-preference)');
    expect(motion).toBeGreaterThanOrEqual(0);
    // Every `animation:` sits inside the no-preference block.
    expect(css.slice(0, motion)).not.toMatch(/animation\s*:/);
    // The tongues morph their path (`d`) and fall back to a stretch where `d` isn't animatable.
    expect(css).toMatch(/d:\s*path\(/);
    expect(css).toMatch(/scale/);
  });

  it('colours come from the HDS cobalt ramp, never hex', () => {
    const css = flameCss();
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(css).toMatch(/var\(--primitive-color-cobalt-\d+\)/);
    // A darker cobalt edge on the light header, a brighter one on dark.
    expect(css).toMatch(/\[data-theme='dark'\][^{]*\.rjb-flame/);
  });

  it('pauses while the tab is hidden', () => {
    const { container } = render(<BrandMark />);
    const svg = container.querySelector('svg')!;
    expect(svg.hasAttribute('data-paused')).toBe(false);
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(svg.hasAttribute('data-paused')).toBe(true);
  });
});

describe('the icon flame', () => {
  it('public/favicon.svg is the static flame, coloured from HDS variables (npm run icons)', () => {
    const favicon = readFileSync('public/favicon.svg', 'utf8');
    expect(favicon).toBe(flameSvg({ tile: true, color: hdsColor, label: BRAND.name }));
    expect(favicon).not.toMatch(/Apply Board|var\(/);
  });

  it('reads cobalt hex values from the shipped HDS variables', () => {
    expect(hdsColor('cobalt-500')).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
