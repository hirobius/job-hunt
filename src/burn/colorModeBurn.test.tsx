import { afterEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { ColorModeProvider, useColorMode } from '../ColorMode';

const ref: { api?: ReturnType<typeof useColorMode> } = {};
function Probe() {
  const api = useColorMode();
  useEffect(() => {
    ref.api = api;
  });
  return null;
}
const mount = () =>
  render(
    <ColorModeProvider>
      <Probe />
    </ColorModeProvider>,
  );

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  delete (document as { startViewTransition?: unknown }).startViewTransition;
});

const reduced = (on: boolean) =>
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: q.includes('reduce') ? on : false,
    addEventListener() {},
    removeEventListener() {},
  }));

describe('burnToggle (#688)', () => {
  it('swaps at once under reduced motion, without starting a View Transition', () => {
    reduced(true);
    const start = vi.fn();
    (document as { startViewTransition?: unknown }).startViewTransition = start;
    mount();
    const before = ref.api!.mode;
    act(() => ref.api!.burnToggle({ x: 10, y: 10 }));
    expect(start).not.toHaveBeenCalled();
    expect(document.documentElement.dataset.theme).toBe(before === 'dark' ? 'light' : 'dark');
  });

  it('swaps without a burn under Pause animations', async () => {
    reduced(false);
    localStorage.setItem('rjb_ui_pause_motion', '1');
    const start = vi.fn();
    (document as { startViewTransition?: unknown }).startViewTransition = start;
    mount();
    const before = ref.api!.mode;
    act(() => ref.api!.burnToggle({ x: 10, y: 10 }));
    await waitFor(() => expect(ref.api!.mode).not.toBe(before));
    expect(start).not.toHaveBeenCalled();
  });

  it('the theme-color metas follow the theme', () => {
    reduced(true);
    document.head.insertAdjacentHTML('beforeend', '<meta name="theme-color" content="x">');
    mount();
    const meta = document.querySelector('meta[name="theme-color"]')!;
    expect(meta.getAttribute('content')).toBe(getComputedStyle(document.body).backgroundColor);
  });
});
