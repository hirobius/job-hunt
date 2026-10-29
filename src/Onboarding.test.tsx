// The Search profile form's sync gate (#99, #388): signed in, a pull may be about to restore the
// profile, so the form waits for sync to settle instead of offering to set one up over it.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Onboarding } from './Onboarding';
import { CloudSyncContext, type CloudSyncApi } from './account/accountContext';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const withSync = (settled: boolean) => (
  <CloudSyncContext.Provider value={{ settled } as CloudSyncApi}>
    <Onboarding />
  </CloudSyncContext.Provider>
);

describe('Onboarding sync gate', () => {
  it('signed in, it waits until sync settles, then shows the form', () => {
    localStorage.setItem('sb-abc-auth-token', '{}');
    const { rerender } = render(withSync(false));
    expect(screen.getByText('Restoring your search…')).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument(); // the spinner announces loading
    expect(screen.queryByText('Set up your search')).toBeNull();
    rerender(withSync(true));
    expect(screen.getByText('Set up your search')).toBeInTheDocument();
  });

  it('signed out, it never waits', () => {
    render(withSync(false));
    expect(screen.getByText('Set up your search')).toBeInTheDocument();
  });
});
