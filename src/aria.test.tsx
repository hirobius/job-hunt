import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { ToastProvider } from '@hirobius/design-system';
import TrackerView from './TrackerView';
import DiscoverView from './DiscoverView';
import { addJob, getAllJobs, removeJob } from './store';
import { replaceCurationState } from './curation/curationStore';
import { seedPack } from './curation/starterPacks';
import { legacyScreensForThisTest } from './test/legacy';

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
    addJob('https://acme.example/jobs/1', 'Design Engineer');
    withTheme(<TrackerView />);
    // The status filter is a menu button (#129) whose name carries the selected view.
    expect(screen.getByRole('button', { name: /^Status: Active/ })).toBeInTheDocument();
  });

  it('Discover sections are one named region with the open section under its heading', () => {
    legacyScreensForThisTest();
    window.location.hash = '#/discover/apply'; // the sections live under Apply now
    withTheme(<DiscoverView />);
    // Stacked, not tabs (rev-3 G): no tab without its panel.
    expect(screen.queryByRole('tab')).toBeNull();
    const region = screen.getByRole('region', { name: 'Your sections' });
    expect(within(region).getAllByRole('heading', { level: 3 }).length).toBeGreaterThan(0);
  });
});
