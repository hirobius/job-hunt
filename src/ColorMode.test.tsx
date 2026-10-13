// HDS keys dark mode on BOTH `[data-theme="dark"]` and the `.dark` class. index.html used to
// hard-code `class="dark"`, so light mode still ran HDS's dark rules (light text tokens on light
// surfaces → invisible selected tabs/filters). The provider owns both, in sync.
import { afterEach, describe, expect, it } from 'vitest';
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
});

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
});
