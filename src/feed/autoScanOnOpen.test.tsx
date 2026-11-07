// The auto-scan runs on open for a signed-in person only, and never behind the sign-in screen
// (2026-11-07): on a phone its board reads made the screen crawl. It waits while the screen is
// open, and a run in flight stops when it opens. Signed out, the server's sync is the scan.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { CloudSyncContext, type CloudSyncApi } from '../account/accountContext';

const scan = vi.hoisted(() => ({ start: vi.fn(() => () => {}), cancel: vi.fn() }));
vi.mock('./autoScan', async (orig) => ({
  ...(await orig<typeof import('./autoScan')>()),
  scanOnOpen: scan.start,
  cancelScan: scan.cancel,
}));

const { AutoScanOnOpen } = await import('./useAutoScan');

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

const host = (over: Partial<CloudSyncApi>) => (
  <CloudSyncContext.Provider value={api(over)}>
    <AutoScanOnOpen />
  </CloudSyncContext.Provider>
);

afterEach(() => {
  cleanup();
  scan.start.mockClear();
  scan.cancel.mockClear();
});

describe('AutoScanOnOpen and the sign-in screen', () => {
  it('scans on open once sync has settled, with the sign-in screen closed', () => {
    render(host({}));
    expect(scan.start).toHaveBeenCalledTimes(1);
    expect(scan.cancel).not.toHaveBeenCalled();
  });

  it('waits while the sign-in screen is open, and starts when it closes', () => {
    const view = render(host({ signInOpen: true }));
    expect(scan.start).not.toHaveBeenCalled();
    view.rerender(host({ signInOpen: false }));
    expect(scan.start).toHaveBeenCalledTimes(1);
  });

  it('stops a run in flight when the sign-in screen opens', () => {
    const stop = vi.fn();
    scan.start.mockReturnValueOnce(stop);
    const view = render(host({}));
    view.rerender(host({ signInOpen: true }));
    expect(stop).toHaveBeenCalled();
    expect(scan.cancel).toHaveBeenCalledTimes(1);
  });

  it('signed out, nothing scans on open', () => {
    render(host({ user: null }));
    expect(scan.start).not.toHaveBeenCalled();
  });

  it('a sign-out stops a run in flight', () => {
    const stop = vi.fn();
    scan.start.mockReturnValueOnce(stop);
    const view = render(host({}));
    view.rerender(host({ user: null }));
    expect(stop).toHaveBeenCalled();
    expect(scan.cancel).toHaveBeenCalledTimes(1);
  });

  it('does nothing before sync has settled', () => {
    render(host({ settled: false }));
    expect(scan.start).not.toHaveBeenCalled();
  });
});
