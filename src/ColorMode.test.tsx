// HDS keys dark mode on BOTH `[data-theme="dark"]` and the `.dark` class. index.html used to
// hard-code `class="dark"`, so light mode still ran HDS's dark rules (light text tokens on light
// surfaces → invisible selected tabs/filters). The provider owns both, in sync.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { Button } from '@hirobius/design-system';
import { ColorModeProvider, useColorMode } from './ColorMode';

function Toggle() {
  const { mode, toggle } = useColorMode();
  return <Button onClick={toggle}>{mode}</Button>;
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

/** Stub the OS colour scheme (jsdom has no matchMedia). */
function prefersDark(dark: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: q.includes('dark') ? dark : !dark,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

describe('ColorModeProvider', () => {
  it.each(['light', 'dark'] as const)(
    '%s mode sets data-theme and the .dark class together',
    (m) => {
      localStorage.setItem('rjb_color_mode', m);
      document.documentElement.classList.add('dark'); // what index.html used to ship
      render(
        <ColorModeProvider>
          <Toggle />
        </ColorModeProvider>,
      );
      expect(document.documentElement.dataset.theme).toBe(m);
      expect(document.documentElement.classList.contains('dark')).toBe(m === 'dark');
    },
  );

  it('toggling flips both', () => {
    localStorage.setItem('rjb_color_mode', 'dark');
    render(
      <ColorModeProvider>
        <Toggle />
      </ColorModeProvider>,
    );
    act(() => screen.getByRole('button').click());
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it.each([
    [true, 'dark'],
    [false, 'light'],
  ] as const)('a first visit follows the OS (prefers dark: %s → %s)', (dark, m) => {
    prefersDark(dark);
    render(
      <ColorModeProvider>
        <Toggle />
      </ColorModeProvider>,
    );
    expect(document.documentElement.dataset.theme).toBe(m);
    // Nothing is stored until the user picks, so a later OS change is still followed.
    expect(localStorage.getItem('rjb_color_mode')).toBeNull();
  });

  it('a stored pick beats the OS, and toggling stores it', () => {
    prefersDark(true);
    localStorage.setItem('rjb_color_mode', 'light');
    render(
      <ColorModeProvider>
        <Toggle />
      </ColorModeProvider>,
    );
    expect(document.documentElement.dataset.theme).toBe('light');
    act(() => screen.getByRole('button').click());
    expect(localStorage.getItem('rjb_color_mode')).toBe('dark');
  });
});
