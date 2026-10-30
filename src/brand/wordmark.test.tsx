// The wordmark: the flame, then "hiraga" (Adrian 2026-10-30; was St(flame)ke). One markup builder
// (wordmarkMarkup) serves the header, the sign-in screen and the og-image (npm run icons). The
// name's own run is plain text's box, and the flame never makes the line taller;
// e2e/brand.spec.ts measures that in a real browser.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { BRAND } from '../brand';
import { Wordmark } from './Wordmark';
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

  it('the flame moves and the letters flicker (Version E), unless motion is reduced', () => {
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', (q: string) => ({ media: q, matches: false }));
    render(<Wordmark as="p" />);
    const word = document.querySelector('.rjb-logo-word')!;
    const outer = word.querySelector('.flame-1')!;
    const still = outer.getAttribute('d');
    act(() => vi.advanceTimersByTime(250));
    expect(outer.getAttribute('d')).not.toBe(still);
    expect((word.querySelector('.rjb-wordmark-l') as HTMLElement).style.transform).toMatch(/skewX/);
    cleanup();
    vi.stubGlobal('matchMedia', (q: string) => ({ media: q, matches: q.includes('reduce') }));
    render(<Wordmark as="p" />);
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

  it('npm run icons draws the og-image wordmark from the same markup', () => {
    const script = readFileSync('scripts/make-icons.mjs', 'utf8');
    expect(script).toMatch(/wordmarkMarkup/);
    expect(script).toMatch(/wordmark\.css/);
    expect(wordmarkMarkup('<svg/>')).toContain('<svg/>');
  });

  it('sizes the flame from the font (cap height) and never changes line-height or tracking', () => {
    const css = readFileSync('src/brand/wordmark.css', 'utf8');
    expect(css).toMatch(/height:\s*[\d.]+cap/);
    expect(css).not.toMatch(/letter-spacing|line-height/);
  });
});
