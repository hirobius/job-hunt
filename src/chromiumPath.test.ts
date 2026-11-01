import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Cloud sessions ship Chromium at a versioned path that moves with each image
 * (chromium-1194 → chromium-1243, #315). The stable link is /opt/pw-browsers/chromium: the E2E
 * config falls back to it, and no doc or script names a versioned build.
 */
const read = (p: string) => fs.readFileSync(p, 'utf8');
const FILES = [
  'CLAUDE.md',
  'playwright.config.ts',
  'docs/loop-queue.md',
  'scripts/gallery.mjs',
  'scripts/make-icons.mjs',
  'scripts/make-screenshots.mjs',
];

describe('cloud Chromium path (#315)', () => {
  it('names no versioned build', () => {
    expect(FILES.filter((f) => /chromium-\d+/.test(read(f)))).toEqual([]);
  });

  it('the E2E config falls back to the stable link when PW_CHROMIUM_PATH is unset or missing', () => {
    const config = read('playwright.config.ts');
    expect(config).toContain("'/opt/pw-browsers/chromium'");
    expect(config).toMatch(/existsSync/);
  });
});
