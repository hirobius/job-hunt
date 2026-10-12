import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { Onboarding } from './Onboarding';
import { setCurationSyncStatus } from './curation/syncStatus';

afterEach(() => {
  cleanup();
  setCurationSyncStatus('idle');
});

describe('Onboarding sync gate (#99)', () => {
  it('waits while a sign-in pull may restore tracks, then shows the packs', () => {
    setCurationSyncStatus('syncing');
    render(<Onboarding />);
    expect(screen.getByText('Restoring your tracks…')).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument(); // the spinner announces loading
    expect(screen.queryByText('Set up your board')).toBeNull();
    act(() => setCurationSyncStatus('error')); // e.g. paused project → still lets them onboard
    expect(screen.getByText('Set up your board')).toBeInTheDocument();
  });
});
