import { describe, expect, it, vi } from 'vitest';
import { createStore } from './createStore';

describe('createStore', () => {
  it('get() returns the initial value, then the latest set value', () => {
    const s = createStore({ n: 1 });
    expect(s.get()).toEqual({ n: 1 });
    s.set({ n: 2 });
    expect(s.get()).toEqual({ n: 2 });
  });

  it('notifies subscribers on set and stops after unsubscribe', () => {
    const s = createStore(0);
    const cb = vi.fn();
    const off = s.subscribe(cb);
    s.set(1);
    s.set(2);
    expect(cb).toHaveBeenCalledTimes(2);
    off();
    s.set(3);
    expect(cb).toHaveBeenCalledTimes(2);
    expect(s.get()).toBe(3);
  });

  it('calls onSet with the next value before notifying', () => {
    const seen: number[] = [];
    const s = createStore(0, { onSet: (n) => seen.push(n) });
    s.subscribe(() => seen.push(s.get()));
    s.set(5);
    // onSet fires first (5), then the subscriber observes the committed value (5).
    expect(seen).toEqual([5, 5]);
  });

  it('does not require onSet', () => {
    const s = createStore('a');
    expect(() => s.set('b')).not.toThrow();
    expect(s.get()).toBe('b');
  });
});
