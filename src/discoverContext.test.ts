import { afterEach, describe, expect, it, vi } from 'vitest';
import { contextLabel, modeKey, readMode, writeMode } from './discoverContext';

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
    expect(contextLabel('', 'any')).toBe('Anywhere, Any mode');
    expect(contextLabel('Spokane', 'remote')).toBe('Remote');
  });
});
