// The animated logo (RoleFlame.tsx) follows WCAG 2.2.2 (Pause, Stop, Hide): Pause animations and
// reduced motion stop it, and a hidden tab pauses it. Under reduced motion at load it shows the
// still mark; paused mid-run it freezes on the frame on screen and Play goes on from there
// (Adrian 2026-11-13).
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoleFlameLogo } from './RoleFlame';

/** The old limit (WCAG 2.2.2 auto-stop): gone since Adrian 2026-11-09, the flame never stops. */
const OLD_LIMIT_MS = 5000;
import { setMotionPaused } from '../motionPref';

let reduce = false;
let hidden = false;
let mqListeners: (() => void)[] = [];

beforeEach(() => {
  reduce = false;
  localStorage.removeItem('rjb_ui_pause_motion');
  hidden = false;
  mqListeners = [];
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', (q: string) => ({
    media: q,
    get matches() {
      return q.includes('reduce') && reduce;
    },
    addEventListener: (_: string, fn: () => void) => mqListeners.push(fn),
    removeEventListener: (_: string, fn: () => void) =>
      (mqListeners = mqListeners.filter((l) => l !== fn)),
  }));
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete (document as { hidden?: boolean }).hidden;
});

function setHidden(h: boolean) {
  hidden = h;
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

function mount(props: { layout?: 'inline' | 'stacked' } = {}) {
  const { container } = render(<RoleFlameLogo {...props} />);
  const d = () => container.querySelector('path')!.getAttribute('d');
  const letterTransform = () =>
    (container.querySelector('.rjb-rf-l') as HTMLElement).style.transform;
  return { d, letterTransform };
}

const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

describe('RoleFlameLogo motion', () => {
  for (const layout of ['inline', 'stacked'] as const)
    it(`never stops on its own (${layout === 'stacked' ? 'sign-in' : 'app bar'}, Adrian 2026-11-09)`, () => {
      const { d } = mount({ layout });
      const still = d();
      advance(300);
      expect(d()).not.toBe(still);
      advance(OLD_LIMIT_MS * 4);
      const later = d();
      advance(300);
      expect(d()).not.toBe(later);
      expect(later).not.toBeNull();
    });

  it('holds frame 0 under reduced motion', () => {
    reduce = true;
    const { d } = mount();
    const still = d();
    advance(OLD_LIMIT_MS + 3000);
    expect(d()).toBe(still);
  });

  it('Pause animations (Account menu, WCAG 2.2.2) freezes the flame on the frame on screen', () => {
    const { d } = mount();
    const still = d();
    advance(300);
    const current = d();
    expect(current).not.toBe(still);
    act(() => setMotionPaused(true));
    // Adrian 2026-11-13: it stops where it is, never snapping back to the still mark.
    expect(d()).toBe(current);
    advance(2000);
    expect(d()).toBe(current);
    // Play goes on from there.
    act(() => setMotionPaused(false));
    expect(d()).toBe(current);
    advance(300);
    expect(d()).not.toBe(current);
    expect(d()).not.toBe(still);
  });

  it('paused from the start (an earlier choice) shows the still mark', () => {
    act(() => setMotionPaused(true));
    const { d } = mount();
    const still = d();
    advance(2000);
    expect(d()).toBe(still);
    expect(still).not.toBeNull();
  });

  it('Play wins over the system setting: an explicit choice runs the flame under reduced motion', () => {
    reduce = true;
    const { d } = mount();
    const still = d();
    advance(1000);
    // No choice yet: it follows the system and holds still.
    expect(d()).toBe(still);
    act(() => setMotionPaused(false));
    advance(300);
    expect(d()).not.toBe(still);
  });

  it('pauses while the tab is hidden, and hidden time does not count', () => {
    const { d } = mount();
    advance(1000);
    setHidden(true);
    const paused = d();
    advance(60_000);
    expect(d()).toBe(paused);
    setHidden(false);
    // 4 s of on-screen time is left: it still moves before the limit.
    advance(1000);
    expect(d()).not.toBe(paused);
  });

  it('does not start while the tab is hidden', () => {
    hidden = true;
    const { d } = mount();
    const still = d();
    advance(3000);
    expect(d()).toBe(still);
  });

  it('holds frame 0 with letters at rest under reduced motion', () => {
    reduce = true;
    const { d, letterTransform } = mount();
    const still = d();
    advance(1000);
    expect(d()).toBe(still);
    expect(letterTransform()).toMatch(/skewX\(0\.00deg\)/);
  });

  it('stops on the frame on screen when reduced motion turns on mid-run', () => {
    const { d } = mount();
    const first = d();
    advance(500);
    const current = d();
    expect(current).not.toBe(first);
    reduce = true;
    act(() => mqListeners.forEach((l) => l()));
    expect(d()).toBe(current);
    advance(1000);
    expect(d()).toBe(current);
  });
});

// Sign-in memory (2026-11-12): the sign-in screen's logo and the app bar's run at once; one that
// unmounts must leave no timer or listener behind, or a second fire keeps running unseen.
describe('unmount', () => {
  it('leaves no flame timer, media-query or visibility listener running', () => {
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    const { unmount } = render(<RoleFlameLogo />);
    act(() => void vi.advanceTimersByTime(500));
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    expect(mqListeners).toHaveLength(0);
    const visAdds = add.mock.calls.filter(([t]) => t === 'visibilitychange').length;
    const visRemoves = remove.mock.calls.filter(([t]) => t === 'visibilitychange').length;
    expect(visRemoves).toBe(visAdds);
    add.mockRestore();
    remove.mockRestore();
  });
});
