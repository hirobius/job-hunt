// The brand lockup (Adrian 2026-10-24): a live procedural flame (three layers, drawn as code)
// beside the Sora wordmark. Still under prefers-reduced-motion; the icons keep the placeholder square.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { BRAND } from '../../brand';
import { BrandLogo } from './BrandFlame';
import { flameFrames } from './flame';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function motion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: reduce && q.includes('reduce'),
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

const paths = (c: HTMLElement) => [...c.querySelectorAll('svg.rjb-flame path')].map((p) => p.getAttribute('d'));

describe('BrandLogo', () => {
  it('is the flame (decorative) then the wordmark h1', () => {
    motion(true);
    const { container } = render(<BrandLogo fontSize={19} />);
    const h1 = screen.getByRole('heading', { level: 1, name: BRAND.name });
    expect(h1.textContent).toBe(BRAND.name);
    const svg = container.querySelector('svg.rjb-flame')!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('draws three filled layers as live paths, not an image', () => {
    motion(true);
    const { container } = render(<BrandLogo />);
    for (const n of [1, 2, 3]) expect(container.querySelector(`.rjb-flame-${n}`)?.getAttribute('d')).toMatch(/^M[\d.,LMZ-]+$/);
    expect(container.querySelector('img, canvas, image')).toBeNull();
  });

  it('animates: a new frame each tick', () => {
    motion(false);
    vi.useFakeTimers();
    const { container } = render(<BrandLogo />);
    const first = paths(container);
    act(() => vi.advanceTimersByTime(1000 / 6 + 1));
    expect(paths(container)).not.toEqual(first);
  });

  it('holds one fixed frame under prefers-reduced-motion', () => {
    motion(true);
    vi.useFakeTimers();
    const { container } = render(<BrandLogo />);
    const first = paths(container);
    act(() => vi.advanceTimersByTime(3000));
    expect(paths(container)).toEqual(first);
    // the same frame on every load: stable screenshots
    cleanup();
    const again = render(<BrandLogo />);
    expect(paths(again.container)).toEqual(first);
  });

  it('never repeats a frame while it plays (endless)', () => {
    const next = flameFrames(5);
    const seen = new Set(Array.from({ length: 48 }, () => next().join('|')));
    expect(seen.size).toBe(48);
  });

  it('is coloured by HDS blue primitives and set in the display family at 700', () => {
    const css = readFileSync('src/theme/base.css', 'utf8');
    const flame = /\.rjb-flame\s*\{([^}]*)\}/.exec(css)![1];
    expect(flame).toMatch(/--rjb-flame-1:\s*var\(--primitive-color-blue-500\)/);
    expect(flame).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    const word = /\.rjb-logo-word\s*\{([^}]*)\}/.exec(css)![1];
    expect(word).toMatch(/var\(--hds-font-family-display\)/);
    expect(word).toMatch(/font-weight:\s*700/);
  });
});

describe('the icon square', () => {
  it('public/favicon.svg is still the placeholder square on the tile (npm run icons)', () => {
    const favicon = readFileSync('public/favicon.svg', 'utf8');
    expect(favicon).toMatch(/<rect/);
    expect(favicon).not.toMatch(/path|gradient|filter|animate|Apply Board|var\(/);
  });
});
