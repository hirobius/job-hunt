// The placeholder mark beside the wordmark (Adrian 2026-10-22): a decorative rounded square, no
// motion. The icons and the share image draw the same square (scripts/make-icons.mjs).
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { BrandMark } from './BrandMark';

afterEach(cleanup);

describe('BrandMark', () => {
  it('is one decorative element: aria-hidden, no text, no media', () => {
    const { container } = render(<BrandMark />);
    const mark = container.firstElementChild!;
    expect(mark.getAttribute('aria-hidden')).toBe('true');
    expect(mark.className).toBe('rjb-brand-mark');
    expect(mark.textContent).toBe('');
    expect(container.querySelector('svg, img, canvas, video, title')).toBeNull();
  });

  it('is styled from HDS tokens only, with no animation', () => {
    const css = readFileSync('src/theme/base.css', 'utf8');
    const rule = /\.rjb-brand-mark\s*\{([^}]*)\}/.exec(css)![1];
    expect(rule).toMatch(/var\(--primitive-radius-\d+\)/);
    expect(rule).toMatch(/var\(--semantic-color-surface-muted\)/);
    expect(rule).not.toMatch(/#[0-9a-f]{3,8}\b|animation|transition|accent|cobalt/i);
  });

  it('keeps no flame code behind', () => {
    expect(() => readFileSync('src/flameMark.ts')).toThrow();
  });
});

describe('the icon square', () => {
  it('public/favicon.svg is the placeholder square on the tile (npm run icons)', () => {
    const favicon = readFileSync('public/favicon.svg', 'utf8');
    expect(favicon).toMatch(/<rect/);
    expect(favicon).not.toMatch(/path|gradient|filter|animate|Apply Board|var\(/);
  });
});
