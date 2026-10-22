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
  it('is RoleForge, with a capital F (Adrian 2026-10-22)', () => {
    expect(BRAND.name).toBe('RoleForge');
    expect(BRAND.wordmark).toEqual(['Role', 'Forge']);
    expect(BRAND.slug).toBe('roleforge');
  });

  it('is internally consistent', () => {
    expect(BRAND.wordmark.join('')).toBe(BRAND.name);
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
      new RegExp(`Apply Board|RoleForge|${BRAND.name}`).test(readFileSync(f, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});
