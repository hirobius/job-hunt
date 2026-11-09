import { describe, expect, it } from 'vitest';
import { keyboardOpen } from './useVisualViewportVars';

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
