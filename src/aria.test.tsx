import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ToastProvider } from '@hirobius/design-system';
import TrackerView from './TrackerView';
import DiscoverView from './DiscoverView';
import { getAllJobs, removeJob } from './store';
import { replaceCurationState } from './curation/curationStore';
import { seedPack } from './curation/starterPacks';

// Discover shows first-run Onboarding on an empty store, so seed a track before rendering it.
beforeEach(() => {
  replaceCurationState({ categories: [], groups: [], tiles: [] });
  seedPack('consulting');
});

afterEach(() => {
  cleanup();
  replaceCurationState({ categories: [], groups: [], tiles: [] });
  getAllJobs()
    .slice()
    .forEach((j) => removeJob(j.url));
});

const withTheme = (ui: React.ReactNode) => render(<ToastProvider>{ui}</ToastProvider>);

describe('aria wiring', () => {
  it('Tracker status filter names the current view', () => {
    withTheme(<TrackerView />);
    // The status filter is a menu button (#129) whose name carries the selected view.
    expect(screen.getByRole('button', { name: /^Status: Active/ })).toBeInTheDocument();
  });

  it('Discover tab is associated with its tabpanel both ways', () => {
    withTheme(<DiscoverView />);
    const selected = screen.getByRole('tab', { selected: true });
    const panel = screen.getByRole('tabpanel');
    expect(selected.getAttribute('aria-controls')).toBe(panel.getAttribute('id'));
    expect(panel.getAttribute('aria-labelledby')).toBe(selected.getAttribute('id'));
  });
});
