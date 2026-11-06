// #478: a signed-in device with no jobs yet waits for its cloud copy on the Jobs tab, never "0 jobs".
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

afterEach(cleanup);
import { ToastProvider } from '@hirobius/design-system';
import TrackerView from './TrackerView';
import { CloudSyncContext, type CloudSyncApi } from './account/accountContext';

vi.mock('./supabase', async (orig) => ({
  ...(await orig<typeof import('./supabase')>()),
  needsClientAtBoot: () => true,
}));

const sync = (settled: boolean, offline = false) =>
  ({ settled, offline }) as unknown as CloudSyncApi;
const at = (value: CloudSyncApi) =>
  render(
    <ToastProvider>
      <CloudSyncContext.Provider value={value}>
        <TrackerView />
      </CloudSyncContext.Provider>
    </ToastProvider>,
  );

describe('Jobs tab while the cloud copy loads (#478)', () => {
  it('says it is loading, not 0 jobs, until sync settles', () => {
    at(sync(false));
    expect(screen.getByRole('status')).toHaveTextContent('Loading your jobs…');
    expect(screen.queryByText('0 jobs')).toBeNull();
  });

  it('shows the page once sync has settled', () => {
    at(sync(true));
    expect(screen.queryByText('Loading your jobs…')).toBeNull();
    expect(screen.getByText('Track your first job')).toBeInTheDocument();
  });

  it('offline, there is nothing to wait for', () => {
    at(sync(false, true));
    expect(screen.queryByText('Loading your jobs…')).toBeNull();
  });
});
