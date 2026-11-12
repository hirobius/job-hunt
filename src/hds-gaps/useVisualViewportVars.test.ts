import { describe, expect, it } from 'vitest';
import { dockLift, keyboardOpen, visibleBottomGap } from './useVisualViewportVars';

// Two states, not a live size (2026-11-09): open when the visible height is under 80% of innerHeight.
describe('keyboardOpen', () => {
  it('is closed on a full screen and a small browser-bar change', () => {
    expect(keyboardOpen(844, 844)).toBe(false);
    expect(keyboardOpen(700, 844)).toBe(false);
  });
  it('is open once the keyboard takes more than a fifth of the screen', () => {
    expect(keyboardOpen(670, 844)).toBe(true);
    expect(keyboardOpen(420, 844)).toBe(true);
  });
});

// #593: the action dock sits this far up, so an on-screen keyboard never covers it.
describe('visibleBottomGap', () => {
  it('is 0 with no keyboard', () => {
    expect(visibleBottomGap({ offsetTop: 0, height: 844 }, 844)).toBe(0);
  });
  it('is the keyboard height when it is up, also with the page scrolled inside', () => {
    expect(visibleBottomGap({ offsetTop: 0, height: 500 }, 844)).toBe(344);
    expect(visibleBottomGap({ offsetTop: 120, height: 500 }, 844)).toBe(224);
  });
  it('is never below 0 (an overscroll bounce)', () => {
    expect(visibleBottomGap({ offsetTop: 40, height: 844 }, 844)).toBe(0);
  });
});

// iOS scroll / overscroll moved the dock up (fix/dock-ios-scroll): it lifts only for a keyboard.
describe('dockLift', () => {
  it('is 0 while scrolling or bouncing with no field focused', () => {
    expect(dockLift({ offsetTop: 0, height: 500 }, 844, false)).toBe(0);
    expect(dockLift({ offsetTop: -60, height: 784 }, 844, true)).toBe(0);
    expect(dockLift({ offsetTop: 200, height: 760 }, 844, true)).toBe(0);
  });
  it('is the keyboard height while a field has focus and a keyboard is open', () => {
    expect(dockLift({ offsetTop: 0, height: 500 }, 844, true)).toBe(344);
  });
});
