import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import {
  ESTIMATE_PX,
  heightOf,
  rememberHeight,
  resetHeights,
  segmentsOf,
  useWindowedList,
  windowAt,
} from './useWindowedList';

afterEach(() => {
  resetHeights();
  vi.unstubAllGlobals();
});

const h100 = () => 100;

describe('windowAt', () => {
  it('keeps everything when the list fits the window', () => {
    expect(windowAt(50, h100, 10, 5000)).toEqual({ start: 0, end: 50 });
  });
  it('centres the window on the item at the viewport centre, in steps', () => {
    // Items 110 px apart: 300 * 110 = 33,000; centre at item 150.
    expect(windowAt(300, h100, 10, 150 * 110 + 5)).toEqual({ start: 100, end: 200 });
    expect(windowAt(300, h100, 10, 0)).toEqual({ start: 0, end: 100 });
  });
  it('never runs past the end', () => {
    expect(windowAt(300, h100, 10, 1e9)).toEqual({ start: 200, end: 300 });
  });
});

describe('segmentsOf', () => {
  it('replaces each hidden run with one spacer as tall as its items and inner gaps', () => {
    const segs = segmentsOf(10, { start: 4, end: 6 }, new Set([8]), h100, 10);
    expect(segs).toEqual([
      { kind: 'spacer', key: 'gap-0', px: 4 * 100 + 3 * 10 },
      { kind: 'item', index: 4 },
      { kind: 'item', index: 5 },
      { kind: 'spacer', key: 'gap-6', px: 2 * 100 + 10 },
      { kind: 'item', index: 8 },
      { kind: 'spacer', key: 'gap-9', px: 100 },
    ]);
  });
  it('keeps the total height of the list', () => {
    const all = 10 * 100 + 9 * 10;
    const segs = segmentsOf(10, { start: 3, end: 5 }, new Set(), h100, 10);
    const total = segs.reduce((t, s) => t + (s.kind === 'spacer' ? s.px : 100), 0);
    expect(total + (segs.length - 1) * 10).toBe(all);
  });
});

describe('height cache', () => {
  it('estimates, then uses the measured height and the mean for the rest', () => {
    expect(heightOf('a')).toBe(ESTIMATE_PX);
    rememberHeight('a', 200);
    rememberHeight('b', 300);
    expect(heightOf('a')).toBe(200);
    expect(heightOf('zzz')).toBe(250);
    rememberHeight('a', 400);
    expect(heightOf('zzz')).toBe(350);
    rememberHeight('c', 0);
    expect(heightOf('c')).toBe(350);
  });
});

describe('useWindowedList', () => {
  it('observes mounted items and disconnects its observer on unmount', () => {
    const observe = vi.fn();
    const unobserve = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = observe;
        unobserve = unobserve;
        disconnect = disconnect;
      },
    );
    const keys = Array.from({ length: 150 }, (_, i) => `k${i}`);
    function List() {
      const { listRef, itemRef, segments } = useWindowedList(keys, ['k140']);
      return (
        <div ref={listRef}>
          {segments.map((s) =>
            s.kind === 'item' ? (
              <div key={keys[s.index]} ref={itemRef(keys[s.index])} />
            ) : (
              <div key={s.key} data-spacer="" />
            ),
          )}
        </div>
      );
    }
    const { container, unmount } = render(<List />);
    // The window (100) plus the kept item; the rest is spacers.
    expect(container.querySelectorAll('[data-window-key]')).toHaveLength(101);
    expect(container.querySelector('[data-window-key="k140"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-spacer]').length).toBeGreaterThan(0);
    expect(observe).toHaveBeenCalled();
    unmount();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
