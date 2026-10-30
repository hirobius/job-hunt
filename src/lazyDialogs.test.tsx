// A lazy dialog whose chunk won't load closes its sheet instead of throwing to the app's error
// boundary (#371 review): the host renders the view only once it is in.
import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useLoadedWhen } from './lazyDialogs';

describe('useLoadedWhen', () => {
  it('waits until wanted, then is ready once the chunk is in', async () => {
    const view = { preload: vi.fn(() => Promise.resolve()), loaded: () => false };
    const { result, rerender } = renderHook(({ on }) => useLoadedWhen(view, on, () => {}), {
      initialProps: { on: false },
    });
    expect(view.preload).not.toHaveBeenCalled();
    rerender({ on: true });
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('calls onFail and stays not ready when the chunk fails', async () => {
    const onFail = vi.fn();
    const view = { preload: () => Promise.reject(new Error('chunk gone')), loaded: () => false };
    const { result } = renderHook(() => useLoadedWhen(view, true, onFail));
    await waitFor(() => expect(onFail).toHaveBeenCalledOnce());
    expect(result.current).toBe(false);
  });

  it('is ready on the first render when the chunk is already in (#212: no second pass)', () => {
    const view = { preload: vi.fn(() => Promise.resolve()), loaded: () => true };
    const { result } = renderHook(() => useLoadedWhen(view, true, () => {}));
    expect(result.current).toBe(true);
    expect(view.preload).not.toHaveBeenCalled();
  });
});
