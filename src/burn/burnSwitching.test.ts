import { afterEach, describe, expect, it, vi } from 'vitest';
import { burnTheme, endSwitching, startSwitching } from './burn';

// #695 review: the no-transition class and the burn's marks on <html> never outlive their burn.
const root = document.documentElement;

afterEach(() => {
  vi.unstubAllGlobals();
  delete (document as { startViewTransition?: unknown }).startViewTransition;
  root.classList.remove('rjb-theme-switching');
});

describe('theme burn cleanup (#695)', () => {
  it('a transition that throws at start leaves nothing on <html>', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: false,
      media: q,
      addEventListener() {},
      removeEventListener() {},
    }));
    (document as { startViewTransition?: unknown }).startViewTransition = () => {
      throw new Error('no');
    };
    await expect(burnTheme({ x: 10, y: 10 }, () => {})).rejects.toThrow('no');
    expect(root.hasAttribute('data-rjb-burning')).toBe(false);
    expect(root.style.getPropertyValue('--rjb-burn-clip')).toBe('');
    expect(root.classList.contains('rjb-theme-switching')).toBe(false);
    expect(document.querySelector('.rjb-burn-rim, .rjb-burn-logo-old')).toBeNull();
  });

  it("an earlier burn's late removal leaves a newer burn's class on", () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => frames.push(f));
    const first = startSwitching();
    endSwitching(first, 2);
    const second = startSwitching();
    while (frames.length) frames.shift()!(0);
    expect(root.classList.contains('rjb-theme-switching')).toBe(true);
    endSwitching(second, 2);
    while (frames.length) frames.shift()!(0);
    expect(root.classList.contains('rjb-theme-switching')).toBe(false);
  });
});
