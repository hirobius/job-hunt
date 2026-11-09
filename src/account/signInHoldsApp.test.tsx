// Nothing heavy runs behind the sign-in screen (2026-11-09): while it is open the page under it
// is not mounted, so no feed read, feed build, liveness read or scan starts; closing it (Continue
// without an account) mounts the page again.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { CloudSyncContext, type CloudSyncApi } from './accountContext';

const scan = vi.hoisted(() => ({ start: vi.fn(() => () => {}), cancel: vi.fn() }));
vi.mock('../feed/autoScan', async (orig) => ({
  ...(await orig<typeof import('../feed/autoScan')>()),
  scanOnOpen: scan.start,
  cancelScan: scan.cancel,
}));

const { HoldBehindSignIn } = await import('../App');
const { AutoScanOnOpen } = await import('../feed/useAutoScan');

const api = (over: Partial<CloudSyncApi>): CloudSyncApi => ({
  user: { id: 'u1', email: 'sam@example.com' } as CloudSyncApi['user'],
  authResolved: true,
  status: '',
  settled: true,
  offline: false,
  sendLink: async () => null,
  signInWithGoogle: async () => null,
  retry: () => {},
  signOut: () => {},
  deleteMyData: () => {},
  signInOpen: false,
  setSignInOpen: () => {},
  ...over,
});

/** Stands in for a page that reads the network as it mounts (the feed, liveness). */
function Page() {
  useEffect(() => {
    void fetch('/api/feed');
  }, []);
  return <p>page</p>;
}

const tree = (over: Partial<CloudSyncApi>) => (
  <CloudSyncContext.Provider value={api(over)}>
    <AutoScanOnOpen />
    <HoldBehindSignIn>
      <Page />
    </HoldBehindSignIn>
  </CloudSyncContext.Provider>
);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  scan.start.mockClear();
  scan.cancel.mockClear();
});

describe('the sign-in screen holds the app', () => {
  it('starts no scan and no fetch while it is open', () => {
    const fetchMock = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    render(tree({ signInOpen: true }));
    expect(screen.queryByText('page')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(scan.start).not.toHaveBeenCalled();
  });

  it('mounts the page once it closes (Continue without an account)', () => {
    const fetchMock = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    const { rerender } = render(tree({ signInOpen: true, user: null }));
    rerender(tree({ signInOpen: false, user: null }));
    expect(screen.getByText('page')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
