import { beforeEach, describe, expect, it } from 'vitest';
import { setDiscoverSeed, consumeDiscoverSeed } from './discoverSeed';

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
