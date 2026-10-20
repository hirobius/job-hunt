// Sharing and crawler basics (#47): the page carries a canonical URL, Open Graph and a Twitter
// card, all named from brand.ts; robots.txt lets crawlers read the public app.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { BRAND } from './brand';
import { applyBrand } from './brandHtml';

const SITE = 'https://job-hunt-jade.vercel.app/';
const html = applyBrand(readFileSync('index.html', 'utf8'));
const meta = (attr: 'name' | 'property', key: string) =>
  new RegExp(`<meta\\s+${attr}="${key}"\\s+content="([^"]*)"`).exec(html)?.[1];

describe('meta tags (#47)', () => {
  it('names one canonical URL, and og:url matches it', () => {
    expect(html).toContain(`<link rel="canonical" href="${SITE}" />`);
    expect(meta('property', 'og:url')).toBe(SITE);
  });

  it('fills Open Graph and the Twitter card from brand.ts', () => {
    expect(meta('property', 'og:site_name')).toBe(BRAND.name);
    expect(meta('property', 'og:title')).toBe(BRAND.name);
    expect(meta('property', 'og:description')).toBe(BRAND.description);
    expect(meta('name', 'twitter:card')).toBe('summary');
    expect(meta('name', 'twitter:title')).toBe(BRAND.name);
    expect(meta('name', 'twitter:description')).toBe(BRAND.description);
  });

  it('keeps the favicon and touch icon', () => {
    expect(html).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg" />');
    expect(html).toContain('rel="apple-touch-icon"');
  });

  it('robots.txt allows the whole site', () => {
    const robots = readFileSync('public/robots.txt', 'utf8');
    expect(robots).toMatch(/^User-agent: \*$/m);
    expect(robots).toMatch(/^Allow: \/$/m);
    expect(robots).not.toMatch(/^Disallow: \/\s*$/m);
  });
});
