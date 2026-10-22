// Return paths: coming back to a page (browser Back, an in-app Back, a top tab reopening where it
// was) brings back its scroll position once the page is tall enough to hold it, instead of the
// browser restoring too early and clamping to the page just left. jsdom has no layout, so the
// page height and scrolling are stubbed.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import { installScrollMemory, isRestoring } from './scrollMemory';
import { requestScrollRestore } from './route';

let height = 1000;
let y = 0;
const scrollTo = vi.fn((_x: number | ScrollToOptions, top?: number) => {
  y = typeof _x === 'number' ? (top ?? 0) : (_x.top ?? 0);
});
const scrollBy = async (to: number) => {
  y = to;
  window.dispatchEvent(new Event('scroll'));
  await new Promise((r) => setTimeout(r, 0));
};

beforeEach(() => {
  height = 1000;
  y = 0;
  Object.defineProperty(document.documentElement, 'scrollHeight', {
    configurable: true,
    get: () => height,
  });
  Object.defineProperty(window, 'scrollY', { configurable: true, get: () => y });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
  window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
  scrollTo.mockClear();
  installScrollMemory();
});
afterEach(() => {
  window.scrollTo = () => {};
});

describe('scroll memory', () => {
  it("restores a page's position once it is tall enough to hold it", async () => {
    window.location.hash = '#/queue';
    await new Promise((r) => setTimeout(r, 10));
    height = 4000;
    await scrollBy(2577);
    window.location.hash = '#/queue/abc';
    await new Promise((r) => setTimeout(r, 10));
    await scrollBy(0);
    // Back on the list: the page is still the short job page for a moment, then the list renders.
    height = 900;
    window.location.hash = '#/queue';
    requestScrollRestore('#/queue');
    expect(isRestoring()).toBe(true);
    await new Promise((r) => setTimeout(r, 50));
    expect(y).not.toBe(2577);
    height = 4000;
    await waitFor(() => expect(y).toBe(2577));
    expect(isRestoring()).toBe(false);
  });

  it('a page never scrolled comes back at its top', async () => {
    window.location.hash = '#/legal/privacy';
    await new Promise((r) => setTimeout(r, 10));
    y = 300;
    requestScrollRestore('#/legal/terms');
    window.location.hash = '#/legal/terms';
    await waitFor(() => expect(y).toBe(0));
  });
});
