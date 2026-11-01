// While a signed-in device with nothing on it waits for its cloud copy, the page shows the flame
// instead of flashing the first-run setup. A ready app (signed out, or data already here) is
// never held, and the hold gives up after BOOT_HOLD_MAX_MS so a slow pull never blocks the page.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { BRAND } from '../brand';
import { BOOT_HOLD_MAX_MS, BootHold } from './BootHold';
import { loadMotion } from './startFlame';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const page = <p>The page</p>;
const held = () => screen.queryByRole('status', { name: `Loading ${BRAND.name}` });

describe('BootHold', () => {
  it('never holds an app that is ready', () => {
    render(
      <BootHold waiting={false} settled={false}>
        {page}
      </BootHold>,
    );
    expect(screen.getByText('The page')).toBeInTheDocument();
    expect(held()).toBeNull();
  });

  it('shows the flame while an empty signed-in device waits, then the page once settled', () => {
    const { rerender } = render(
      <BootHold waiting settled={false}>
        {page}
      </BootHold>,
    );
    expect(held()).not.toBeNull();
    expect(held()!.querySelector('.rjb-flame svg .flame-1')).not.toBeNull();
    expect(screen.queryByText('The page')).toBeNull();
    rerender(
      <BootHold waiting settled>
        {page}
      </BootHold>,
    );
    expect(held()).toBeNull();
    expect(screen.getByText('The page')).toBeInTheDocument();
  });

  it('the held flame moves (Version E) while it waits', async () => {
    await loadMotion();
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', (q: string) => ({ media: q, matches: false }));
    render(
      <BootHold waiting settled={false}>
        {page}
      </BootHold>,
    );
    await act(async () => {}); // the motion chunk's then
    const outer = held()!.querySelector('.flame-1')!;
    const still = outer.getAttribute('d');
    act(() => vi.advanceTimersByTime(250));
    expect(outer.getAttribute('d')).not.toBe(still);
    vi.unstubAllGlobals();
  });

  it('gives up after BOOT_HOLD_MAX_MS', () => {
    vi.useFakeTimers();
    render(
      <BootHold waiting settled={false}>
        {page}
      </BootHold>,
    );
    expect(BOOT_HOLD_MAX_MS).toBeLessThanOrEqual(4000);
    act(() => vi.advanceTimersByTime(BOOT_HOLD_MAX_MS));
    expect(held()).toBeNull();
    expect(screen.getByText('The page')).toBeInTheDocument();
  });

  it('once shown, the page never goes back to the flame', () => {
    const { rerender } = render(
      <BootHold waiting settled>
        {page}
      </BootHold>,
    );
    rerender(
      <BootHold waiting settled={false}>
        {page}
      </BootHold>,
    );
    expect(held()).toBeNull();
  });
});
