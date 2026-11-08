// The auto-scan's UI (#415): Scan now with the last scan's line, New companies with Follow /
// Ignore (and Undo), and the scan that runs on its own when the app opens.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dialog, ToastProvider } from '@hirobius/design-system';
import { NewCompanies, ScanStatus } from './AutoScanViews';
import ScanDetailsDialog from './ScanDetailsDialog';
import { hiddenParts, setScanDetails } from './feed/scanDetails';
import NoticeHost from './NoticeHost';
import { dismissNotice } from './saveNotice';
import {
  SCAN_EVERY_MS,
  getScanState,
  resetScan,
  runScan,
  scanOnOpen,
  setScanOnOpen,
  type ScanDeps,
} from './feed/autoScan';
import { YC_HIRING_URL } from './feed/companySource';
import { createLimiter } from './feed/probe';
import { FetchError, type FetchJson } from './feed/sources/http';
import { getSources } from './sources';
import { getAllDecided } from './feed/decided';
import type { PostingReader } from './feed/reader';
import { CloudSyncContext, type CloudSyncApi } from './account/accountContext';
import { feedKeys, resetBoardSetKeys } from './feed/scanningCount';
import { replaceProfiles } from './profile';

// The server's last sync run (#448), as sync_log would answer it.
const server = vi.hoisted(() => ({ at: null as string | null }));
vi.mock('./tracks/postings', async (orig) => ({
  ...(await orig<typeof import('./tracks/postings')>()),
  loadServerUpdatedAt: async () => server.at,
}));

const ACME = 'https://boards.greenhouse.io/acme';
const fetchJson = (async (url: string) => {
  if (url === YC_HIRING_URL)
    return [
      {
        name: 'Acme',
        website: 'https://acme.com',
        one_liner: 'A design system studio',
        status: 'Active',
      },
      {
        name: 'Forward',
        website: 'https://goforward.com',
        one_liner: 'design system tools',
        status: 'Active',
      },
    ];
  if (/greenhouse\.io\/v1\/boards\/(acme|forward)\//.test(url)) return { jobs: [{ id: 1 }] };
  if (url.startsWith('https://api.lever.co/v0/postings/forward')) return [{ id: 'x' }];
  throw new FetchError(404, url);
}) as FetchJson;
const reader: PostingReader = {
  read: async (req) => ({
    postings: req.boardUrls.includes(ACME)
      ? [
          {
            id: 'greenhouse:acme:1',
            source: 'greenhouse',
            title: 'Design Systems Engineer',
            company: 'Acme',
            url: 'https://example.org/1',
            location: 'Remote',
            mode: 'remote',
            text: '',
          },
        ]
      : [],
    sources: [{ key: 'hn', label: 'Hacker News', fetched: 0 }],
  }),
};
const deps = (): ScanDeps => ({
  fetchJson,
  reader,
  limiter: createLimiter({ gapMs: 0 }),
  now: Date.now,
  pause: () => Promise.resolve(),
  sources: { adele: false, github: false },
});

beforeEach(() => {
  localStorage.clear();
  resetScan();
  dismissNotice();
  resetBoardSetKeys();
  replaceProfiles([]);
  server.at = null;
});
afterEach(cleanup);

const renderViews = ({ signedIn = false } = {}) =>
  render(
    <CloudSyncContext.Provider
      value={{ user: signedIn ? { id: 'u1', email: 'a@b.c' } : null } as CloudSyncApi}
    >
      <ToastProvider>
        <ScanStatus />
        <NewCompanies />
        <NoticeHost />
      </ToastProvider>
    </CloudSyncContext.Provider>,
  );

describe('ScanStatus (Adrian 2026-11-08: no status text on Find)', () => {
  it('signed out: one compact Scan now and no line on the page', async () => {
    renderViews();
    expect(screen.getByRole('button', { name: 'Scan now' })).toBeEnabled();
    await runScan({ terms: ['Design Systems Engineer'], boardUrls: [] }, deps());
    expect(screen.queryByText(/^Scanning |^Last scanned|^Not scanned|^Updated /)).toBeNull();
  });

  it('signed in: nothing at all (the server syncs every 15 minutes)', async () => {
    server.at = new Date(Date.now() - 4 * 60_000).toISOString();
    const { container } = renderViews({ signedIn: true });
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole('button', { name: /^(Scan now|Stop scan)$/ })).toBeNull();
    expect(container.textContent).not.toMatch(/Updated|Scanning|scanned/);
  });
});

describe('Scan details (the Account menu)', () => {
  const renderDetails = ({ signedIn = false } = {}) =>
    render(
      <CloudSyncContext.Provider
        value={{ user: signedIn ? { id: 'u1', email: 'a@b.c' } : null } as CloudSyncApi}
      >
        <Dialog open>
          <ScanDetailsDialog />
        </Dialog>
      </CloudSyncContext.Provider>,
    );
  afterEach(() => setScanDetails(null));

  it('signed out: not scanned yet, then the last scan’s time and counts', async () => {
    renderDetails();
    expect(screen.getByText(/^Not scanned yet/)).toBeInTheDocument();
    await runScan({ terms: ['Design Systems Engineer'], boardUrls: [] }, deps());
    // Only what this browser reads: the feeds and Acme's confirmed board (Forward's unconfirmed
    // board is never read).
    const browser = feedKeys().length + 1;
    expect(
      await screen.findByText(
        new RegExp(`^Scanning ${browser} sources · Last scanned \\d\\d:\\d\\d, 1 new$`),
      ),
    ).toBeInTheDocument();
  });

  it('signed in: when the server last updated, or how often before its first run', async () => {
    server.at = new Date(Date.now() - 4 * 60_000).toISOString();
    renderDetails({ signedIn: true });
    expect(await screen.findByText('Updated 4 min ago')).toBeInTheDocument();
    cleanup();
    server.at = null;
    renderDetails({ signedIn: true });
    expect(await screen.findByText('Updates every 15 minutes.')).toBeInTheDocument();
  });

  it('lists what Review new left out and each source that didn’t answer, with why', () => {
    setScanDetails({
      failed: [
        { label: 'Acme · Greenhouse', error: 'Acme — no answer' },
        { label: 'Remotive · design system', error: 'daily limit reached' },
      ],
      hidden: hiddenParts({
        saved: 1,
        decided: 2,
        muted: 0,
        include: 12,
        exclude: 0,
        seniority: 0,
        salary: 0,
      }),
      newToday: 3,
      sourcesRead: 9,
    });
    renderDetails();
    expect(screen.getByText('1 saved, 2 skipped, 12 not design-system roles')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '2 sources unavailable' })).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Sources unavailable' });
    expect(within(list).getByText('Acme: no answer')).toBeInTheDocument();
    expect(
      within(list).getByText("Remotive: today's free searches are used up, more tomorrow."),
    ).toBeInTheDocument();
  });

  it('before Find has read: says to open Find', () => {
    renderDetails();
    expect(screen.getByText(/^Open Find to read your sources/)).toBeInTheDocument();
  });
});


describe('NewCompanies', () => {
  it('lists what the scan found; an unconfirmed board says so', async () => {
    await runScan({ terms: ['Design Systems Engineer'], boardUrls: [] }, deps());
    renderViews();
    const list = screen.getByRole('list', { name: 'New companies' });
    expect(within(list).getByText('1 matching job · from YC')).toBeVisible();
    expect(within(list).getByText(/^Board not confirmed/)).toBeVisible();
  });

  it('Follow adds the board to the Sources, with Undo', async () => {
    await runScan({ terms: ['Design Systems Engineer'], boardUrls: [] }, deps());
    renderViews();
    await userEvent.click(screen.getByRole('button', { name: 'Follow Acme' }));
    expect(getSources().map((x) => x.ref)).toEqual(['acme']);
    expect(screen.queryByRole('button', { name: 'Follow Acme' })).toBeNull();
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    expect(getSources()).toEqual([]);
    expect(screen.getByRole('button', { name: 'Follow Acme' })).toBeVisible();
  });

  it('Ignore mutes the company', async () => {
    await runScan({ terms: ['Design Systems Engineer'], boardUrls: [] }, deps());
    renderViews();
    await userEvent.click(screen.getByRole('button', { name: 'Ignore Forward' }));
    expect(getAllDecided().muted).toEqual(['Forward']);
    expect(screen.queryByText('Forward')).toBeNull();
  });
});

describe('scan on open', () => {
  afterEach(() => setScanOnOpen(false));

  it('scans when due, and not again within 6 hours', async () => {
    setScanOnOpen(true);
    const read = vi.fn(reader.read);
    const d = () => ({ ...deps(), reader: { read } });
    scanOnOpen(() => ({ terms: ['Design Systems Engineer'], boardUrls: [] }), d);
    await waitFor(() => expect(getScanState().finishedAt).toBeDefined());
    expect(read).toHaveBeenCalledTimes(1);
    scanOnOpen(() => ({ terms: ['Design Systems Engineer'], boardUrls: [] }), d);
    await new Promise((r) => setTimeout(r, 20));
    expect(read).toHaveBeenCalledTimes(1);
    expect(SCAN_EVERY_MS).toBe(6 * 3600e3);
  });

  it('is off unless turned on (unit tests never read the network)', async () => {
    setScanOnOpen(false);
    const read = vi.fn(reader.read);
    scanOnOpen(
      () => ({ terms: [], boardUrls: [] }),
      () => ({ ...deps(), reader: { read } }),
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(read).not.toHaveBeenCalled();
  });
});
