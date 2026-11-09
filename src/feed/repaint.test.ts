import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REPAINT_MAX_MS, REPAINT_MS, repaintScheduler, whenIdle } from './repaint';

describe('repaintScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // jsdom has no requestIdleCallback: the setTimeout fallback runs these.
    expect(typeof requestIdleCallback).toBe('undefined');
  });
  afterEach(() => vi.useRealTimers());

  it('waits 1, then 2, 4 and 8 s between repaints, and never more than 8 s', () => {
    const paint = vi.fn();
    const r = repaintScheduler<number>(paint);
    const gaps: number[] = [];
    let t = 0;
    for (let i = 0; i < 6; i++) {
      r.push(i);
      const start = t;
      while (paint.mock.calls.length === i) {
        vi.advanceTimersByTime(1);
        t += 1;
      }
      gaps.push(t - start);
    }
    // Each wait, then the idle callback's setTimeout 0 (1 ms of fake time here).
    expect(gaps).toEqual([1001, 2001, 4001, 8001, 8001, 8001]);
    expect(REPAINT_MS).toBe(1000);
    expect(REPAINT_MAX_MS).toBe(8000);
  });

  it('paints the newest progress, not the one that scheduled it, once per wait', () => {
    const paint = vi.fn();
    const r = repaintScheduler<string>(paint);
    r.push('a');
    vi.advanceTimersByTime(500);
    r.push('b');
    r.push('c');
    vi.advanceTimersByTime(600);
    expect(paint.mock.calls).toEqual([['c']]);
  });

  it('cancel drops a scheduled repaint and ignores later progress', () => {
    const paint = vi.fn();
    const r = repaintScheduler<number>(paint);
    r.push(1);
    r.cancel();
    r.push(2);
    vi.advanceTimersByTime(20000);
    expect(paint).not.toHaveBeenCalled();
  });
});

describe('whenIdle', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('falls back to setTimeout 0 without requestIdleCallback, and cancels', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    whenIdle(fn, 1000);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(0);
    expect(fn).toHaveBeenCalledTimes(1);
    const late = vi.fn();
    whenIdle(late, 1000)();
    vi.advanceTimersByTime(10);
    expect(late).not.toHaveBeenCalled();
  });

  it('uses requestIdleCallback with the timeout when there is one', () => {
    const ric = vi.fn(() => 7);
    const cic = vi.fn();
    vi.stubGlobal('requestIdleCallback', ric);
    vi.stubGlobal('cancelIdleCallback', cic);
    const fn = () => {};
    whenIdle(fn, 1000)();
    expect(ric).toHaveBeenCalledWith(fn, { timeout: 1000 });
    expect(cic).toHaveBeenCalledWith(7);
  });
});
