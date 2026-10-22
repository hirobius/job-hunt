import { afterEach, describe, expect, it, vi } from 'vitest';
import { collapseRow, flash, highlightNew, motionOk, takeHighlight } from './feedback';

const reduce = (on: boolean) =>
  (window.matchMedia = vi.fn().mockImplementation((media: string) => ({
    matches: on && media.includes('reduce'),
    media,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia);

afterEach(() => {
  vi.useRealTimers();
  delete (window as { matchMedia?: unknown }).matchMedia;
  document.body.innerHTML = '';
});

describe('motionOk', () => {
  it('is false without matchMedia (jsdom) and under reduced motion', () => {
    expect(motionOk()).toBe(false);
    reduce(true);
    expect(motionOk()).toBe(false);
    reduce(false);
    expect(motionOk()).toBe(true);
  });
});

describe('flash', () => {
  it('marks the element, then clears the mark', () => {
    vi.useFakeTimers();
    const el = document.createElement('div');
    flash(el);
    expect(el.classList.contains('rjb-flash')).toBe(true);
    vi.advanceTimersByTime(2000);
    expect(el.classList.contains('rjb-flash')).toBe(false);
  });

  it('is a no-op without an element', () => {
    expect(() => flash(null)).not.toThrow();
  });
});

describe('collapseRow', () => {
  const row = () => {
    document.body.innerHTML = '<ul><li><button>Remove</button></li></ul>';
    return document.querySelector('button')!;
  };

  it('collapses the row the action sits in, then runs the action', () => {
    vi.useFakeTimers();
    reduce(false);
    const done = vi.fn();
    const btn = row();
    collapseRow(btn, done);
    expect(btn.closest('li')!.classList.contains('rjb-collapse')).toBe(true);
    expect(done).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(done).toHaveBeenCalledOnce();
  });

  it('runs at once under reduced motion: the state changes, nothing moves', () => {
    reduce(true);
    const done = vi.fn();
    const btn = row();
    collapseRow(btn, done);
    expect(done).toHaveBeenCalledOnce();
    expect(btn.closest('li')!.classList.contains('rjb-collapse')).toBe(false);
  });
});

describe('highlightNew', () => {
  it('hands the key to the one item that asks for it, once', () => {
    highlightNew('doc-2');
    expect(takeHighlight('doc-1')).toBe(false);
    expect(takeHighlight('doc-2')).toBe(true);
    expect(takeHighlight('doc-2')).toBe(false);
  });
});
