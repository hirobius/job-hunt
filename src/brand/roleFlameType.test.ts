// The logo's name is Sora 800 (Adrian 2026-11-10; was HDS's display token, Sora 700). HDS ships only
// Sora 700, so the logo carries exactly one face of its own, with its licence, for the logo only.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/theme/base.css', 'utf8');
const ruleOf = (sel: string) => css.slice(css.indexOf(sel), css.indexOf('}', css.indexOf(sel)));

describe('RoleFlame logo type', () => {
  it('sets the animated logo and the still wordmark in Sora 800, HDS display as the fallback', () => {
    for (const sel of ['.rjb-rf {', '.rjb-logo-word {']) {
      const rule = ruleOf(sel);
      expect(rule).toMatch(
        /font-family: 'Roleflame Sora', var\(--(semantic-typography|hds-font-family)-display/,
      );
      expect(rule).toContain('font-weight: 800;');
    }
    expect(ruleOf('@font-face')).toContain("url('../brand/fonts/sora-800.woff2')");
  });

  it('carries one Sora face, with its licence, and RoleFlame sets no font itself', () => {
    const files = readdirSync('src', { recursive: true }) as string[];
    const own = files.filter((f) => /sora/i.test(f) && /\.(woff2?|ttf|otf)$/.test(f));
    expect(own.map((f) => f.replace(/\\/g, '/'))).toEqual(['brand/fonts/sora-800.woff2']);
    expect(existsSync('src/brand/fonts/sora-LICENSE.txt')).toBe(true);
    expect(readFileSync('src/brand/RoleFlame.tsx', 'utf8')).not.toMatch(
      /font-family|fontFamily|Sora,/,
    );
  });
});
