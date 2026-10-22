import { describe, expect, it } from 'vitest';
import { localizeTile, placeKey } from './localize';

const tile = (url: string, name = 'LinkedIn · Consultant (Spokane)') => ({ name, meta: '', url });
const RAW =
  'https://www.linkedin.com/jobs/search/?keywords=implementation%20consultant&location=Spokane%2C%20Washington&f_WT=2&q=a+b&x=%7E#top';

describe('localizeTile rewrites only the place (review, finding 2)', () => {
  it('a URL with %20, + and other params keeps every byte but the place', () => {
    expect(localizeTile(tile(RAW), 'Seattle, WA').url).toBe(
      'https://www.linkedin.com/jobs/search/?keywords=implementation%20consultant&location=Seattle%2C%20WA&f_WT=2&q=a+b&x=%7E#top',
    );
  });

  it('a blank location drops the place param and nothing else', () => {
    expect(localizeTile(tile(RAW), '').url).toBe(
      'https://www.linkedin.com/jobs/search/?keywords=implementation%20consultant&f_WT=2&q=a+b&x=%7E#top',
    );
    expect(localizeTile(tile('https://www.indeed.com/jobs?l=Spokane%2C+WA&q=welder'), '').url).toBe(
      'https://www.indeed.com/jobs?q=welder',
    );
  });

  it('a Spokane track keeps the link exactly as the pack wrote it', () => {
    const raw = 'https://www.indeed.com/jobs?q=fabricator&l=Spokane%2C+WA&fromage=7';
    expect(localizeTile(tile(raw), 'Spokane, WA').url).toBe(raw);
  });

  it('other places and links without a place are left alone', () => {
    const remote = 'https://www.indeed.com/jobs?q=x+y&l=Remote';
    expect(localizeTile(tile(remote), 'Boise, ID').url).toBe(remote);
    const plain = 'https://example.org/careers?a=1%202';
    expect(localizeTile(tile(plain), 'Boise, ID')).toEqual(tile(plain));
  });

  it('a $ in the location reaches the name as typed (finding 5)', () => {
    const out = localizeTile(tile(RAW, 'Indeed · Fabricator (Spokane)'), "$& $' Co");
    expect(out.name).toBe("Indeed · Fabricator ($& $' Co)");
  });
});

describe('placeKey: one key per search whatever its place or encoding (finding 1)', () => {
  it('the raw, the localized and the re-encoded link share a key', () => {
    const reencoded = new URL(RAW);
    reencoded.searchParams.set('location', 'Seattle, WA');
    const keys = new Set([
      placeKey(RAW),
      placeKey(localizeTile(tile(RAW), 'Seattle, WA').url),
      placeKey(localizeTile(tile(RAW), '').url),
      placeKey(reencoded.toString()),
    ]);
    expect(keys.size).toBe(1);
  });

  it('a different search keeps a different key', () => {
    expect(placeKey('https://a.com/s?q=welder&l=Spokane')).not.toBe(
      placeKey('https://a.com/s?q=fabricator&l=Spokane'),
    );
  });
});
