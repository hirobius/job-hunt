import { beforeEach, describe, expect, it } from 'vitest';
import { setDiscoverSeed, consumeDiscoverSeed, seedFor } from './discoverSeed';
import { resetViewMemory } from './viewMemory';

describe('discoverSeed', () => {
  beforeEach(() => {
    // Reset module state before each test
    consumeDiscoverSeed();
  });

  it('trims and stores title', () => {
    setDiscoverSeed('  Sheet Metal Worker   ');
    expect(consumeDiscoverSeed()).toBe('Sheet Metal Worker');
  });

  it('stores null when passed empty or whitespace-only string', () => {
    setDiscoverSeed('');
    expect(consumeDiscoverSeed()).toBeNull();

    setDiscoverSeed('    ');
    expect(consumeDiscoverSeed()).toBeNull();
  });

  it('consumeDiscoverSeed returns value once then null on subsequent calls', () => {
    setDiscoverSeed('Welder');
    expect(consumeDiscoverSeed()).toBe('Welder');
    expect(consumeDiscoverSeed()).toBeNull();
    expect(consumeDiscoverSeed()).toBeNull();
  });

  it('returns null if setDiscoverSeed was never called', () => {
    expect(consumeDiscoverSeed()).toBeNull();
  });
});

describe('seedFor: the seed stays with the search it was handed to (return paths)', () => {
  beforeEach(() => {
    consumeDiscoverSeed();
    resetViewMemory();
  });

  it('a search opened from a job keeps that job’s seed on every later visit; others get none', () => {
    setDiscoverSeed('Welder');
    expect(seedFor('/queue/a')).toBe('Welder');
    expect(seedFor('/queue/a')).toBe('Welder');
    expect(seedFor(null)).toBeNull();
    expect(seedFor('/queue/b')).toBeNull();
  });

  it('a new seed from the same job replaces the old one', () => {
    setDiscoverSeed('Welder');
    seedFor('/queue/a');
    setDiscoverSeed('Fitter');
    expect(seedFor('/queue/a')).toBe('Fitter');
  });
});
