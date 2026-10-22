import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

// Vite fingerprints everything under /assets/ (the hash is in the file name), so a browser may
// keep those files for a year. index.html and the public/ files keep their names and must stay
// revalidated, so only /assets/ gets the long cache.
type Header = { key: string; value: string };
const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8')) as {
  headers: { source: string; headers: Header[] }[];
};
const rule = (source: string) => vercel.headers.find((h) => h.source === source)?.headers ?? [];
const cacheControl = (source: string) => rule(source).find((h) => h.key === 'Cache-Control')?.value;

describe('cache headers', () => {
  it('caches hashed build assets for a year, immutable', () => {
    expect(cacheControl('/assets/(.*)')).toBe('public, max-age=31536000, immutable');
  });

  it('does not long-cache the page or the unhashed public files', () => {
    expect(cacheControl('/(.*)')).toBeUndefined();
    const longCached = vercel.headers.filter((h) =>
      h.headers.some((x) => x.key === 'Cache-Control' && /immutable/.test(x.value)),
    );
    expect(longCached.map((h) => h.source)).toEqual(['/assets/(.*)']);
  });

  it('keeps the security headers, CSP included, on every path', () => {
    const keys = rule('/(.*)').map((h) => h.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        'Content-Security-Policy',
        'Strict-Transport-Security',
        'X-Content-Type-Options',
        'X-Frame-Options',
      ]),
    );
  });
});
