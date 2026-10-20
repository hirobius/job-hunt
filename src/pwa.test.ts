// Installable app and share image (#47): the web app manifest, its PNG icons and the
// Open Graph image. The PNGs come from `npm run icons` (scripts/make-icons.mjs); these tests check
// what ships: sizes read from each PNG's own header, names from brand.ts.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { BRAND } from './brand';
import { applyBrand } from './brandHtml';

const SITE = 'https://job-hunt-jade.vercel.app';
const html = applyBrand(readFileSync('index.html', 'utf8'));
const meta = (attr: 'name' | 'property', key: string) =>
  new RegExp(`<meta\\s+${attr}="${key}"\\s+content="([^"]*)"`).exec(html)?.[1];

/** Width and height from a PNG's IHDR chunk. */
function pngSize(path: string): { w: number; h: number } {
  const b = readFileSync(path);
  expect(b.subarray(1, 4).toString('latin1')).toBe('PNG');
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

interface Manifest {
  name: string;
  short_name: string;
  description: string;
  start_url: string;
  scope: string;
  display: string;
  theme_color: string;
  background_color: string;
  icons: { src: string; sizes: string; type: string; purpose?: string }[];
}
const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8')) as Manifest;

describe('installable app (#47)', () => {
  it('index.html links the manifest', () => {
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
  });

  it('names the app from brand.ts and opens it standalone at the root', () => {
    expect(manifest.name).toBe(BRAND.name);
    expect(manifest.short_name).toBe(BRAND.name);
    expect(manifest.description).toBe(BRAND.description);
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
    expect(manifest.display).toBe('standalone');
  });

  it('uses the page theme colour', () => {
    expect(manifest.theme_color).toBe(meta('name', 'theme-color'));
  });

  it('ships 192 and 512 PNG icons, plus a maskable one, at their stated sizes', () => {
    for (const icon of manifest.icons) {
      expect(icon.type).toBe('image/png');
      const file = `public${icon.src}`;
      expect(existsSync(file)).toBe(true);
      const { w, h } = pngSize(file);
      expect(`${w}x${h}`).toBe(icon.sizes);
    }
    const sizes = manifest.icons.filter((i) => i.purpose !== 'maskable').map((i) => i.sizes);
    expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
    expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true);
  });

  it('gives iOS a 180px PNG touch icon', () => {
    expect(html).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png" />');
    expect(pngSize('public/apple-touch-icon.png')).toEqual({ w: 180, h: 180 });
  });
});

describe('share image (#47)', () => {
  it('is a 1200x630 PNG at an absolute URL, with its size and alt text', () => {
    expect(meta('property', 'og:image')).toBe(`${SITE}/og-image.png`);
    expect(meta('property', 'og:image:width')).toBe('1200');
    expect(meta('property', 'og:image:height')).toBe('630');
    expect(meta('property', 'og:image:alt')).toBe(BRAND.name);
    expect(pngSize('public/og-image.png')).toEqual({ w: 1200, h: 630 });
  });

  it('shows large on Twitter/X', () => {
    expect(meta('name', 'twitter:card')).toBe('summary_large_image');
    expect(meta('name', 'twitter:image')).toBe(`${SITE}/og-image.png`);
  });
});

describe('dependency audit (#47)', () => {
  it('has an audit script that fails on high-severity advisories in shipped dependencies', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.audit).toBe('npm audit --omit=dev --audit-level=high');
  });
});
