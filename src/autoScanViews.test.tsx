// The auto-scan's UI (#415): Scan now with the last scan's line, New companies with Follow /
// Ignore (and Undo), and the scan that runs on its own when the app opens.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@hirobius/design-system';
import { NewCompanies, ScanStatus } from './AutoScanViews';
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
import raw from './feed/data/boards.json';
import { boardSetKeys, parseBoardSet } from './feed/boardSet';
import { feedKeys, resetBoardSetKeys } from './feed/scanningCount';
import { replaceProfiles, type Profile } from './profile';

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

describe('ScanStatus', () => {
  it('says when nothing was scanned yet, then the last scan’s time and counts', async () => {
    renderViews();
    expect(screen.getByRole('status')).toHaveTextContent('Not scanned yet');
    await runScan({ terms: ['Design Systems Engineer'], boardUrls: [] }, deps());
    // Signed out: only what this browser reads, the feeds and Acme's confirmed board (Forward's
    // unconfirmed board is never read).
    const browser = feedKeys().length + 1;
    expect(
      await screen.findByText(
        new RegExp(`^Scanning ${browser} sources · Last scanned \\d\\d:\\d\\d, 1 new$`),
      ),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Scan now' })).toBeEnabled();
  });

  it('signed in with a design systems profile, counts the server’s board set too, each board once', async () => {
    replaceProfiles([dsProfile]);
    await runScan({ terms: ['Design Systems Engineer'], boardUrls: [] }, deps());
    renderViews({ signedIn: true });
    const all = new Set([...boardSetKeys(parseBoardSet(raw)), ...feedKeys(), 'greenhouse:acme'])
      .size;
    expect(all).toBeGreaterThan(feedKeys().length + 1);
    expect(
      await screen.findByText(
        new RegExp(
          `^Scanning ${all.toLocaleString('en-US')} sources · Last scanned \\d\\d:\\d\\d, 1 new$`,
        ),
      ),
    ).toBeVisible();
  });

  it('signed in without a design systems profile, counts only what this browser reads', async () => {
    replaceProfiles([{ ...dsProfile, scorer: undefined }]);
    await runScan({ terms: ['Design Systems Engineer'], boardUrls: [] }, deps());
    renderViews({ signedIn: true });
    expect(
      await screen.findByText(
        new RegExp(
          `^Scanning ${feedKeys().length + 1} sources · Last scanned \\d\\d:\\d\\d, 1 new$`,
        ),
      ),
    ).toBeVisible();
  });
});

const dsProfile: Profile = {
  id: 'main',
  label: 'Design Systems',
  titles: ['Design Systems Designer'],
  titlesOff: [],
  atsRoles: [],
  atsOff: [],
  include: { terms: ['design system'] },
  leaveOut: [],
  level: 'any',
  location: '',
  mode: 'any',
  scorer: 'design-systems',
  createdAt: '2026-10-28T00:00:00.000Z',
};

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
