// The logo's name uses HDS's display type token (Sora 700, ADR-063, hds#847, shipped by HDS's
// fonts.css), never a font file or family of its own (Adrian 2026-11-06).
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/theme/base.css', 'utf8');
const rule = css.slice(css.indexOf('.rjb-rf {'), css.indexOf('}', css.indexOf('.rjb-rf {')));

describe('RoleFlame logo type', () => {
  it('takes the HDS display family and weight tokens', () => {
    expect(rule).toContain('font-family: var(--semantic-typography-display-font-family);');
    expect(rule).toContain('font-weight: var(--semantic-typography-display-font-weight);');
  });

  it('loads no Sora of its own', () => {
    const files = readdirSync('src', { recursive: true }) as string[];
    const own = files.filter((f) => /sora/i.test(f) && /\.(woff2?|ttf|otf|css)$/.test(f));
    expect(own).toEqual([]);
    expect(readFileSync('src/brand/RoleFlame.tsx', 'utf8')).not.toMatch(/font-family|fontFamily|Sora,/);
  });
});
