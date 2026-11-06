// The animated logo (RoleFlame.tsx) follows WCAG 2.2.2 (Pause, Stop, Hide): it moves for at most
// 5 s on screen, then holds frame 0. A hidden tab pauses it (the hidden time does not count).
// Under prefers-reduced-motion it holds frame 0 from the start.
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FLAME_MOTION_LIMIT_MS, RoleFlameLogo } from './RoleFlame';

let reduce = false;
let hidden = false;
let mqListeners: (() => void)[] = [];

beforeEach(() => {
  reduce = false;
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

function mount() {
  const { container } = render(<RoleFlameLogo />);
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
  it('moves, then stops on frame 0 after 5 s on screen', () => {
    const { d } = mount();
    const still = d();
    advance(300);
    expect(d()).not.toBe(still);
    advance(FLAME_MOTION_LIMIT_MS);
    expect(d()).toBe(still);
    advance(2000);
    expect(d()).toBe(still);
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

  it('goes still when reduced motion turns on mid-run', () => {
    const { d } = mount();
    const first = d();
    advance(500);
    expect(d()).not.toBe(first);
    reduce = true;
    act(() => mqListeners.forEach((l) => l()));
    expect(d()).toBe(first);
    advance(1000);
    expect(d()).toBe(first);
  });
});
