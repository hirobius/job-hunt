import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ToastProvider } from '@hirobius/design-system';
import TrackerView from './TrackerView';
import DiscoverView from './DiscoverView';
import { getAllJobs, removeJob } from './store';

afterEach(() => {
  cleanup();
  getAllJobs()
    .slice()
    .forEach((j) => removeJob(j.url));
});

const withTheme = (ui: React.ReactNode) => render(<ToastProvider>{ui}</ToastProvider>);

describe('aria wiring', () => {
  it('Tracker filter group exposes an accessible name', () => {
    withTheme(<TrackerView />);
    // HDS SegmentedControl renders a radiogroup (one-of-many semantics), not MUI's group.
    expect(screen.getByRole('radiogroup', { name: /filter jobs by status/i })).toBeInTheDocument();
  });

  it('Discover tab is associated with its tabpanel both ways', () => {
    withTheme(<DiscoverView />);
    const selected = screen.getByRole('tab', { selected: true });
    const panel = screen.getByRole('tabpanel');
    expect(selected.getAttribute('aria-controls')).toBe(panel.getAttribute('id'));
    expect(panel.getAttribute('aria-labelledby')).toBe(selected.getAttribute('id'));
  });
});
