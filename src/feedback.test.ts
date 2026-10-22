import { afterEach, describe, expect, it, vi } from 'vitest';
import { collapseRow, flash, flashRow, highlightNew, motionOk, takeHighlight } from './feedback';

/** The motion an element is marked with (`data-motion`), or null. */
const motion = (el: Element | null) => el?.getAttribute('data-motion') ?? null;

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
    expect(motion(el)).toBe('flash');
    vi.advanceTimersByTime(2000);
    expect(motion(el)).toBeNull();
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
    expect(motion(btn.closest('li'))).toBe('collapse');
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
    expect(motion(btn.closest('li'))).toBeNull();
  });
});

// The desktop Pipeline is an HDS Table: a div grid whose rows are `role="row"` with
// `display: contents`, so a row has no box of its own and its cells are what can move.
describe('a table row with no box (HDS Table)', () => {
  const gridRow = () => {
    document.body.innerHTML =
      '<div role="table"><div role="row" style="display: contents">' +
      '<div role="cell">Clinical Systems Analyst</div>' +
      '<div role="cell"><button>More actions</button></div>' +
      '</div></div>';
    return {
      btn: document.querySelector('button')!,
      cells: [...document.querySelectorAll('[role="cell"]')],
      row: document.querySelector('[role="row"]')!,
    };
  };

  it('flashRow flashes every cell of the row the action sits in', () => {
    vi.useFakeTimers();
    const { btn, cells, row } = gridRow();
    flashRow(btn);
    for (const cell of cells) expect(motion(cell)).toBe('flash');
    expect(motion(row)).toBeNull();
    vi.advanceTimersByTime(2000);
    for (const cell of cells) expect(motion(cell)).toBeNull();
  });

  // Starring floats the row to the top, and the move changes the cells' divider class: React
  // rewrites a className it owns, so the mark lives in an attribute React never renders.
  it("a re-render that rewrites the cells' className keeps the flash", () => {
    const { btn, cells } = gridRow();
    flashRow(btn);
    for (const cell of cells) cell.className = 'moved';
    for (const cell of cells) expect(motion(cell)).toBe('flash');
  });

  it('collapseRow collapses every cell, then runs the action', () => {
    vi.useFakeTimers();
    reduce(false);
    const done = vi.fn();
    const { btn, cells } = gridRow();
    collapseRow(btn, done);
    for (const cell of cells) expect(motion(cell)).toBe('collapse');
    expect(done).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(done).toHaveBeenCalledOnce();
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
