// The body face (HDS's Plus Jakarta Sans, one variable woff2) is preloaded, so text paints in
// it without waiting for the CSS to be parsed first. The build names the file with a hash, so
// the `preload-font` plugin in vite.config.ts finds it in the bundle.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fontPreloadTag } from './fontPreload';

describe('fontPreloadTag', () => {
  it('preloads the hashed body font, crossorigin (fonts are always fetched in CORS mode)', () => {
    expect(
      fontPreloadTag([
        'assets/index-abc.js',
        'assets/sora-700-bGlaQImR.woff2',
        'assets/plus-jakarta-sans-variable-eXO_dkmS.woff2',
      ]),
    ).toBe(
      '<link rel="preload" href="/assets/plus-jakarta-sans-variable-eXO_dkmS.woff2" as="font" type="font/woff2" crossorigin>',
    );
  });

  it('adds nothing when the bundle has no such font', () => {
    expect(fontPreloadTag(['assets/index-abc.js'])).toBeNull();
  });

  it('names the font HDS ships, and the build uses the plugin', () => {
    const fonts = readFileSync('node_modules/@hirobius/design-system/dist/fonts.css', 'utf8');
    expect(fonts).toContain('./fonts/plus-jakarta-sans-variable.woff2');
    expect(readFileSync('vite.config.ts', 'utf8')).toMatch(/fontPreloadTag\(/);
  });
});
