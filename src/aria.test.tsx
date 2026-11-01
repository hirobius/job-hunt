import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ToastProvider } from '@hirobius/design-system';
import TrackerView from './TrackerView';
import { addJob, getAllJobs, removeJob } from './store';
import { replaceCurationState } from './curation/curationStore';

beforeEach(() => {
  replaceCurationState({ categories: [], groups: [], tiles: [] });
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
});
