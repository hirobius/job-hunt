import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { ThemeProvider } from '@mui/material/styles';
import { Button as MuiButton } from '@mui/material';
import { makeTheme } from '../theme';
import { HdsButton } from './HdsButton';

afterEach(cleanup);
const withTheme = (ui: React.ReactNode) =>
  render(<ThemeProvider theme={makeTheme('dark')}>{ui}</ThemeProvider>);

describe('HdsButton (HDS spike)', () => {
  it('renders a native button by default', () => {
    withTheme(<HdsButton>Go</HdsButton>);
    expect(screen.getByRole('button', { name: 'Go' })).toBeInTheDocument();
  });

  it('renders as the slotted child (Radix asChild) keeping its CVA classes', () => {
    withTheme(
      <HdsButton asChild>
        <a href="#x">Link</a>
      </HdsButton>,
    );
    const link = screen.getByRole('link', { name: 'Link' });
    expect(link).toHaveAttribute('href', '#x');
    expect(link.className).toContain('inline-flex');
  });

  it('coexists with a MUI button with no WCAG A/AA violations', async () => {
    const { container } = withTheme(
      <div>
        <MuiButton variant="contained">MUI</MuiButton>
        <HdsButton>HDS</HdsButton>
      </div>,
    );
    const results = await axe(container, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    });
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});
