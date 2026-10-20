import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { liveStorage } from './liveStorage';

describe('liveStorage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reads the raw stored string, empty when nothing is stored', () => {
    const live = liveStorage('t_live_a');
    const { result } = renderHook(() => live.useRaw());
    expect(result.current).toBe('');
  });

  it('re-renders after notify (a write in this tab)', () => {
    const live = liveStorage('t_live_b');
    const { result } = renderHook(() => live.useRaw());
    act(() => {
      localStorage.setItem('t_live_b', '{"x":1}');
      live.notify();
    });
    expect(result.current).toBe('{"x":1}');
  });

  it('re-renders on a storage event (a write in another tab)', () => {
    const live = liveStorage('t_live_c');
    const { result } = renderHook(() => live.useRaw());
    act(() => {
      localStorage.setItem('t_live_c', '"y"');
      window.dispatchEvent(new StorageEvent('storage', { key: 't_live_c' }));
    });
    expect(result.current).toBe('"y"');
  });

  it('reads as empty when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const live = liveStorage('t_live_d');
    const { result } = renderHook(() => live.useRaw());
    expect(result.current).toBe('');
  });

  it('stops listening once unmounted', () => {
    const live = liveStorage('t_live_e');
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => live.useRaw());
    unmount();
    expect(remove).toHaveBeenCalledWith('storage', expect.any(Function));
  });
});
