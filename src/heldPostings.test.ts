// Review holds late postings behind "N new postings" (Adrian 2026-11-15).
import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { splitHeld, useHeldPostings } from './heldPostings';

const r = (fingerprint: string) => ({ fingerprint });
const fps = (rows: { fingerprint: string }[]) => rows.map((x) => x.fingerprint);

describe('splitHeld', () => {
  it('holds nothing while not holding', () => {
    expect(splitHeld([r('a'), r('b')], null)).toEqual({
      shown: [r('a'), r('b')],
      held: [],
      released: false,
    });
  });

  it('holds rows not shown yet, keeps the known and the kept ones in order', () => {
    const { shown, held } = splitHeld([r('new'), r('a'), r('sel'), r('b')], new Set(['a', 'b']), [
      'sel',
    ]);
    expect(fps(shown)).toEqual(['a', 'sel', 'b']);
    expect(fps(held)).toEqual(['new']);
  });

  it('shows everything when none of the known rows is left (nothing on screen to push down)', () => {
    const out = splitHeld([r('x'), r('y')], new Set(['gone']));
    expect(fps(out.shown)).toEqual(['x', 'y']);
    expect(out.held).toEqual([]);
    expect(out.released).toBe(true);
  });
});

describe('useHeldPostings', () => {
  const profile = {};
  const sources = {};
  const run = (rows: { fingerprint: string }[], settled: boolean, reset = [profile, sources]) => ({
    rows,
    settled,
    reset,
  });
  const hook = () =>
    renderHook(
      ({ rows, settled, reset }) => useHeldPostings(rows, { settled, keep: [null], reset }),
      { initialProps: run([r('a')], false) },
    );

  it('shows postings of the first load as they come', () => {
    const h = hook();
    h.rerender(run([r('b'), r('a')], false));
    expect(fps(h.result.current.shown)).toEqual(['b', 'a']);
    expect(h.result.current.held).toEqual([]);
  });

  it('once settled, a late posting is held; "show" puts it in at its place', () => {
    const h = hook();
    h.rerender(run([r('a'), r('b')], true));
    h.rerender(run([r('late'), r('a'), r('b')], true));
    expect(fps(h.result.current.shown)).toEqual(['a', 'b']);
    expect(fps(h.result.current.held)).toEqual(['late']);
    act(() => h.result.current.showHeld());
    expect(fps(h.result.current.shown)).toEqual(['late', 'a', 'b']);
    expect(h.result.current.held).toEqual([]);
  });

  it('starts holding once the person reads (a scroll), before the read settles', () => {
    const h = hook();
    act(() => {
      document.dispatchEvent(new Event('scroll'));
    });
    h.rerender(run([r('late'), r('a')], false));
    expect(fps(h.result.current.shown)).toEqual(['a']);
    expect(fps(h.result.current.held)).toEqual(['late']);
  });

  it('a change to the profile or Sources fills the list as a first load again', () => {
    const h = hook();
    h.rerender(run([r('a')], true));
    h.rerender(run([r('late'), r('a')], true));
    expect(h.result.current.held).toHaveLength(1);
    h.rerender(run([r('late'), r('a')], false, [profile, {}]));
    expect(fps(h.result.current.shown)).toEqual(['late', 'a']);
    expect(h.result.current.held).toEqual([]);
  });

  it('an undone Skip comes back in its place, never held', () => {
    const h = hook();
    h.rerender(run([r('a'), r('b')], true));
    h.rerender(run([r('b')], true));
    h.rerender(run([r('a'), r('b')], true));
    expect(fps(h.result.current.shown)).toEqual(['a', 'b']);
  });
});
