// The wordmark: "St", the flame in place of the "o", "ke" (Adrian 2026-10-29). One markup builder
// (wordmarkMarkup) serves the header, the sign-in screen and the og-image (npm run icons). Its box
// matches the plain name because the real "o" stays in the line, transparent, and the flame sits
// over it on the baseline; e2e/brand.spec.ts measures that in a real browser.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { BRAND } from '../brand';
import { Wordmark } from './Wordmark';
import { wordmarkMarkup } from './wordmarkMarkup';

afterEach(cleanup);

describe('Wordmark', () => {
  it('is named for assistive tech; its parts and the flame are hidden', () => {
    render(<Wordmark as="h1" />);
    const h1 = screen.getByRole('heading', { level: 1, name: BRAND.name });
    expect(h1).toHaveAttribute('aria-label', BRAND.name);
    for (const part of h1.children) expect(part).toHaveAttribute('aria-hidden', 'true');
  });

  it('keeps the real letters in the line (copy and paste give the name), the o transparent', () => {
    render(<Wordmark as="p" />);
    const word = document.querySelector('.rjb-logo-word')!;
    expect(word.textContent?.replace(/\s+/g, '')).toBe(BRAND.name);
    const o = word.querySelector('.rjb-wordmark-o')!;
    expect(o.querySelector('.rjb-wordmark-ghost')?.textContent).toBe(BRAND.wordmark.flame);
    expect(o.querySelector('.rjb-flame svg path')).not.toBeNull();
    const text = [...word.childNodes].map((n) => n.textContent?.trim());
    expect(text[0]).toBe(BRAND.wordmark.before);
    expect(text[2]).toBe(BRAND.wordmark.after);
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
    expect(css).toMatch(/height:\s*1cap/);
    expect(css).not.toMatch(/letter-spacing|line-height/);
  });
});
