// Dense layout (Adrian, #115): HDS `data-density="compact"` on <html> steps every density-aware
// space token down one step (and Table follows). Compact is the default; the account menu flips it.
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { Button } from '@hirobius/design-system';
import { DensityProvider, useDensity } from './Density';

function Toggle() {
  const { density, toggle } = useDensity();
  return <Button onClick={toggle}>{density}</Button>;
}
const renderIt = () =>
  render(
    <DensityProvider>
      <Toggle />
    </DensityProvider>,
  );

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.removeAttribute('data-density');
});

describe('DensityProvider', () => {
  it('defaults to compact', () => {
    renderIt();
    expect(document.documentElement.dataset.density).toBe('compact');
  });

  it('toggles to comfortable (no attribute) and remembers it', () => {
    renderIt();
    act(() => screen.getByRole('button').click());
    expect(document.documentElement.hasAttribute('data-density')).toBe(false);
    expect(localStorage.getItem('rjb_ui_density')).toBe('comfortable');
    cleanup();
    renderIt();
    expect(screen.getByRole('button')).toHaveTextContent('comfortable');
  });
});
