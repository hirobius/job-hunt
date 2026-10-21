import { afterEach, describe, expect, it, vi } from 'vitest';
import { contextLabel, modeKey, placeLabel, readMode, writeMode } from './discoverContext';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('discoverContext', () => {
  it('defaults to any and round-trips per track', () => {
    expect(readMode('a')).toBe('any');
    writeMode('a', 'hybrid');
    expect(readMode('a')).toBe('hybrid');
    expect(readMode('b')).toBe('any');
    expect(localStorage.getItem(modeKey('a'))).toBe('hybrid');
  });

  it('ignores a corrupt stored value', () => {
    localStorage.setItem(modeKey('a'), 'sideways');
    expect(readMode('a')).toBe('any');
  });

  it('keeps the choice for the session when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    writeMode('z', 'remote');
    expect(readMode('z')).toBe('remote');
  });

  it('labels the context in one line', () => {
    expect(contextLabel('Spokane', 'hybrid')).toBe('Spokane, Hybrid');
    expect(contextLabel('Remote', 'any')).toBe('Remote, any mode');
    expect(contextLabel('', 'any')).toBe('Anywhere, any mode');
    expect(contextLabel('Spokane', 'remote')).toBe('Remote');
  });

  it('labels a tile\'s place fact without "any mode"', () => {
    expect(placeLabel('Remote', 'any')).toBe('Remote');
    expect(placeLabel('', 'any')).toBe('Anywhere');
    expect(placeLabel('Spokane', 'hybrid')).toBe('Spokane, Hybrid');
    expect(placeLabel('Spokane', 'remote')).toBe('Remote');
  });
});
