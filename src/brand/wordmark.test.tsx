// The wordmark: the flame, then "roleflame" (Adrian 2026-11-02, was hiraga 2026-10-30; was St(flame)ke). One markup builder
// (wordmarkMarkup) serves the header, the sign-in screen and the og-image (npm run icons). The
// name's own run is plain text's box, and the flame never makes the line taller;
// e2e/brand.spec.ts measures that in a real browser.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { BRAND } from '../brand';
import { Wordmark } from './Wordmark';
import { loadMotion } from './startFlame';
import { wordmarkMarkup } from './wordmarkMarkup';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Wordmark', () => {
  it('is named for assistive tech; its parts and the flame are hidden', () => {
    render(<Wordmark />);
    // An image named for the product, never a heading: the page's name is its h1 (#363).
    const word = screen.getByRole('img', { name: BRAND.name });
    expect(screen.queryByRole('heading')).toBeNull();
    for (const part of word.children) expect(part).toHaveAttribute('aria-hidden', 'true');
  });

  it('the flame leads; the name follows as real letters (copy and paste give the name)', () => {
    render(<Wordmark as="p" />);
    const word = document.querySelector('.rjb-logo-word')!;
    expect(word.textContent?.replace(/\s+/g, '')).toBe(BRAND.name);
    const [flame, text] = [...word.children];
    expect(flame).toHaveClass('rjb-wordmark-flame');
    expect(flame.querySelector('.rjb-flame svg path')).not.toBeNull();
    expect(text).toHaveClass('rjb-wordmark-text');
    expect(text.textContent).toBe(BRAND.name);
  });

  it('sets each letter in its own span, for the flicker; the og-image keeps a plain run', () => {
    render(<Wordmark as="p" />);
    const word = document.querySelector('.rjb-logo-word')!;
    const letters = [...word.querySelectorAll('.rjb-wordmark-l')].map((l) => l.textContent);
    expect(letters).toEqual([...BRAND.name]);
    expect(wordmarkMarkup('<svg/>')).not.toContain('rjb-wordmark-l');
  });

  it('the flame moves and the letters stay still, and under reduced motion the flame does too', async () => {
    await loadMotion();
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', (q: string) => ({ media: q, matches: false }));
    render(<Wordmark as="p" />);
    await act(async () => {}); // the motion chunk's then
    const word = document.querySelector('.rjb-logo-word')!;
    const outer = word.querySelector('.flame-1')!;
    const still = outer.getAttribute('d');
    act(() => vi.advanceTimersByTime(250));
    expect(outer.getAttribute('d')).not.toBe(still);
    expect((word.querySelector('.rjb-wordmark-l') as HTMLElement).style.transform).toBe('');
    cleanup();
    vi.stubGlobal('matchMedia', (q: string) => ({ media: q, matches: q.includes('reduce') }));
    render(<Wordmark as="p" />);
    await act(async () => {});
    const calm = document.querySelector('.rjb-logo-word .flame-1')!;
    act(() => vi.advanceTimersByTime(250));
    expect(calm.getAttribute('d')).toBe(still);
  });

  it('two wordmarks never share a flame id', () => {
    const { container } = render(
      <>
        <Wordmark as="span" />
        <Wordmark as="span" />
      </>,
    );
    const ids = [...container.querySelectorAll('[id]')].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('npm run icons draws the share image with the app logo’s own lockup (Adrian 2026-11-10)', () => {
    const script = readFileSync('scripts/make-icons.mjs', 'utf8');
    // RoleFlame.tsx's proportions: the flame in its 94 x 146 box at 1.95em, 0.3em before the name.
    expect(script).toMatch(/viewBox="\$\{logoViewBox\(\)\}" style="height:1\.95em/);
    expect(script).toMatch(/gap:0\.3em/);
    expect(readFileSync('src/brand/RoleFlame.tsx', 'utf8')).toMatch(
      /viewBox=\{logoViewBox\(FLAME\)\}/,
    );
  });

  it('sizes the flame from the font (cap height) and never changes line-height or tracking', () => {
    const css = readFileSync('src/brand/wordmark.css', 'utf8');
    expect(css).toMatch(/height:\s*[\d.]+cap/);
    expect(css).not.toMatch(/letter-spacing|line-height/);
  });
});
