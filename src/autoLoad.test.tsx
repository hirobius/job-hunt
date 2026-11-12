import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { useAutoLoad } from './autoLoad';

type Cb = (e: Array<{ isIntersecting: boolean }>) => void;
const made: Array<{
  cb: Cb;
  observe: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}> = [];
class FakeIO {
  observe = vi.fn();
  disconnect = vi.fn();
  constructor(public cb: Cb) {
    made.push(this);
  }
}

function Probe({ on, onMore }: { on: boolean; onMore: () => void }) {
  const ref = useAutoLoad(on, onMore);
  return <div ref={ref} />;
}

afterEach(() => {
  made.length = 0;
  vi.unstubAllGlobals();
});

describe('useAutoLoad (Find Browse auto-load, 2026-11-12)', () => {
  it('loads more as the sentinel comes near, and disconnects on unmount', () => {
    vi.stubGlobal('IntersectionObserver', FakeIO);
    const onMore = vi.fn();
    const { unmount } = render(<Probe on onMore={onMore} />);
    expect(made).toHaveLength(1);
    expect(made[0].observe).toHaveBeenCalledTimes(1);
    made[0].cb([{ isIntersecting: false }]);
    expect(onMore).not.toHaveBeenCalled();
    made[0].cb([{ isIntersecting: true }]);
    expect(onMore).toHaveBeenCalledTimes(1);
    unmount();
    expect(made[0].disconnect).toHaveBeenCalledTimes(1);
  });

  it('does nothing without IntersectionObserver (the Load more key stays the way)', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const onMore = vi.fn();
    render(<Probe on onMore={onMore} />);
    expect(made).toHaveLength(0);
  });

  it('disconnects once nothing is left to load', () => {
    vi.stubGlobal('IntersectionObserver', FakeIO);
    const { rerender } = render(<Probe on onMore={() => {}} />);
    rerender(<Probe on={false} onMore={() => {}} />);
    expect(made[0].disconnect).toHaveBeenCalledTimes(1);
  });
});
