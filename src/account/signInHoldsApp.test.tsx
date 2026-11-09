// Nothing heavy runs behind the sign-in screen (2026-11-09), and nothing typed under it is lost
// (review of #520). The page stays mounted, inert and aria-hidden; the feed read and the scan
// hold on `signInOpen` and start once the screen closes.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CloudSyncContext, type CloudSyncApi } from './accountContext';
import type { PostingReader } from '../feed/reader';

const scan = vi.hoisted(() => ({ start: vi.fn(() => () => {}), cancel: vi.fn() }));
vi.mock('../feed/autoScan', async (orig) => ({
  ...(await orig<typeof import('../feed/autoScan')>()),
  scanOnOpen: scan.start,
  cancelScan: scan.cancel,
}));

const { AutoScanOnOpen } = await import('../feed/useAutoScan');
const { useFeed } = await import('../feed/useFeed');
const { holdPage } = await import('./holdPage');
const { saveProfile, replaceProfiles } = await import('../profile');

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

const reader: PostingReader = {
  read: vi.fn(() => new Promise<never>(() => {})),
};

/** Find's page in small: the feed read, and a field with unsaved text (a draft, a job link). */
function Page({ open }: { open: boolean }) {
  useFeed(reader);
  useEffect(() => holdPage(open), [open]);
  // eslint-disable-next-line hds/no-raw-controls -- a stand-in field, not product UI
  return <input aria-label="Job link" />;
}

const tree = (over: Partial<CloudSyncApi>) => (
  <CloudSyncContext.Provider value={api(over)}>
    <AutoScanOnOpen />
    <main>
      <Page open={!!over.signInOpen} />
    </main>
  </CloudSyncContext.Provider>
);

beforeEach(() => {
  saveProfile({ titles: ['Design Systems Engineer'] });
});

afterEach(() => {
  cleanup();
  replaceProfiles([]);
  localStorage.clear();
  vi.mocked(reader.read).mockClear();
  scan.start.mockClear();
  scan.cancel.mockClear();
});

describe('the sign-in screen holds the app', () => {
  it('starts no feed read, no fetch and no scan while it is open', async () => {
    const fetchMock = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    render(tree({ signInOpen: true }));
    await new Promise((r) => setTimeout(r, 20));
    expect(reader.read).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(scan.start).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('keeps the page mounted (inert, hidden) so typed text survives, and resumes on close', async () => {
    const { rerender } = render(tree({ signInOpen: false, user: null }));
    await waitFor(() => expect(reader.read).toHaveBeenCalledTimes(1));
    const field = screen.getByRole('textbox', { name: 'Job link' });
    fireEvent.change(field, { target: { value: 'https://acme.example/jobs/1' } });

    rerender(tree({ signInOpen: true, user: null }));
    const main = document.querySelector('main')!;
    expect(main.inert).toBe(true);
    expect(main.getAttribute('aria-hidden')).toBe('true');

    rerender(tree({ signInOpen: false, user: null }));
    expect(main.inert).toBe(false);
    expect(main.hasAttribute('aria-hidden')).toBe(false);
    expect((document.querySelector('input') as HTMLInputElement).value).toBe(
      'https://acme.example/jobs/1',
    );
    // The held read starts again once the screen closes.
    await waitFor(() => expect(reader.read).toHaveBeenCalledTimes(2));
  });
});
