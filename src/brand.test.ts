// The product name is swappable from one file (#55): src/brand.ts.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { BRAND } from './brand';
import { applyBrand } from './brandHtml';

const SRC = resolve(__dirname);
const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.(ts|tsx)$/.test(n) &&
      !/\.test\.tsx?$/.test(n) &&
      n !== 'brand.ts' &&
      n !== 'brandHtml.ts'
      ? [p]
      : [];
  });

describe('brand (#55)', () => {
  it('is Roleflame (Adrian 2026-11-02, hirobius/ops#1092; was hiraga, Stoke, RoleForge)', () => {
    expect(BRAND.name).toBe('Roleflame');
    // The flame leads the word (Adrian 2026-10-30): 🔥Roleflame.
    expect(BRAND.wordmark).toEqual({ flame: 'before' });
    expect(BRAND.slug).toBe('roleflame');
  });

  it('is internally consistent', () => {
    expect(BRAND.slug).toBe(BRAND.name.toLowerCase());
    expect(BRAND.slug).toMatch(/^[a-z0-9-]+$/);
  });

  it('index.html takes its name from brand.ts, not hard-coded text', () => {
    const raw = readFileSync(resolve(SRC, '../index.html'), 'utf8');
    expect(raw).toContain('%BRAND_NAME%');
    const html = applyBrand(raw);
    expect(html).toContain(`<title>${BRAND.name}</title>`);
    expect(html).toContain(`content="${BRAND.name}"`);
    expect(html).not.toMatch(/%BRAND_[A-Z]+%/);
  });

  it('no source file hard-codes the old or current display name', () => {
    const offenders = sourceFiles(SRC).filter((f) =>
      new RegExp(`Apply Board|RoleForge|\\bStoke\\b|\\bhiraga\\b|\\b${BRAND.name}\\b`).test(readFileSync(f, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});

describe('brand in public/ (static files, no build step)', () => {
  const PUBLIC = resolve(SRC, '../public');
  const textFiles = readdirSync(PUBLIC).filter((n) => /\.(svg|webmanifest|txt|js|json)$/.test(n));

  it('no public file carries an old name', () => {
    const offenders = textFiles.filter((n) =>
      /Apply Board|RoleForge|Stoke|hiraga/.test(readFileSync(join(PUBLIC, n), 'utf8')),
    );
    expect(offenders).toEqual([]);
  });

  it('the favicon is named after the product', () => {
    const svg = readFileSync(join(PUBLIC, 'favicon.svg'), 'utf8');
    expect(/aria-label="([^"]*)"/.exec(svg)?.[1]).toBe(BRAND.name);
  });
});
