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
    await waitFor(() => expect(isRestoring()).toBe(false), { timeout: 2000 });
  });

  it('holds the position while the page is still settling (rows loading above it)', async () => {
    window.location.hash = '#/copy-deck';
    await new Promise((r) => setTimeout(r, 10));
    height = 3000;
    await scrollBy(681);
    window.location.hash = '#/copy-deck/live';
    await new Promise((r) => setTimeout(r, 10));
    requestScrollRestore('#/copy-deck');
    window.location.hash = '#/copy-deck';
    await waitFor(() => expect(y).toBe(681));
    // Rows above finish loading: the browser keeps what was on screen in place, moving the scroll.
    y = 913;
    height = 3232;
    await waitFor(() => expect(y).toBe(681));
  });

  // Review blocker (2026-10-22): a Pipeline that came back one row shorter (the job was marked
  // applied, removed or retired) never grows back to the old position. It used to sit at the top
  // for the whole long wait, and a scroll in that time lost the row.
  it('a page that came back shorter lands at its end as soon as it holds still', async () => {
    window.location.hash = '#/queue';
    await new Promise((r) => setTimeout(r, 10));
    height = 4000;
    await scrollBy(3200);
    window.location.hash = '#/queue/last';
    await new Promise((r) => setTimeout(r, 10));
    await scrollBy(0);
    height = 3600; // one row fewer: the most it can scroll is 2800
    window.location.hash = '#/queue';
    requestScrollRestore('#/queue');
    await waitFor(() => expect(y).toBe(2800), { timeout: 700 });
    // A row loading late still gets its room: the page grows, the position follows.
    height = 4000;
    await waitFor(() => expect(y).toBe(3200), { timeout: 700 });
  });

  it('holds the position while the browser moves it without the user (rows reordering)', async () => {
    window.location.hash = '#/copy-deck/teams';
    await new Promise((r) => setTimeout(r, 10));
    height = 3000;
    await scrollBy(647);
    window.location.hash = '#/copy-deck/live';
    await new Promise((r) => setTimeout(r, 10));
    requestScrollRestore('#/copy-deck/teams');
    window.location.hash = '#/copy-deck/teams';
    await waitFor(() => expect(y).toBe(647));
    // Rows reorder for a second without changing the page height; scroll anchoring follows one
    // and moves the page each time.
    for (let i = 0; i < 4; i++) {
      await new Promise((r) => setTimeout(r, 250));
      y -= 77;
    }
    await waitFor(() => expect(y).toBe(647));
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
