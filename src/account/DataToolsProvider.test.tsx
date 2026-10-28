import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BRAND } from '../brand';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';

// The curation store pulls in the Supabase client; stub it so the test stays local + offline.
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
    from: () => ({ upsert: async () => ({}), delete: () => ({ eq: async () => ({}) }) }),
  }),
}));

import { renderAccount, openAccount, chooseAccountItem } from '../test/renderAccount';
import { buildBackup, MAX_BACKUP_CHARS, parseBackup } from '../backup';
import { getAllJobs, replaceAll } from '../store';
import { replaceSnippets } from '../copyDeckStore';
import { replaceCurationState } from '../curation/curationStore';
import { replaceTriage } from '../tileTriage';
import type { Job } from '../types';

const job = (url: string, label: string): Job => ({ url, label, status: 'Saved' }) as Job;
const EMPTY = { categories: [], groups: [], tiles: [] };

let downloads: { name: string; blob: Blob }[] = [];

beforeEach(() => {
  downloads = [];
  let pendingBlob: Blob;
  URL.createObjectURL = vi.fn((b: Blob | MediaSource) => {
    pendingBlob = b as Blob;
    return 'blob:test';
  });
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloads.push({ name: this.download, blob: pendingBlob });
  });
  replaceAll([]);
  replaceSnippets([]);
  replaceCurationState(EMPTY);
  replaceTriage({});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const setup = renderAccount;

const backupFile = (jobs: Job[]) =>
  new File(
    [
      JSON.stringify(
        buildBackup(
          {
            jobs,
            copydeck: [],
            curation: EMPTY,
            triage: { dismissed: [] },
            targets: {},
            filters: {},
            evidence: '',
            modes: {},
            trash: [],
            dreams: {},
            documents: [],
            kit: { fields: {}, answers: [] },
            sweeps: {},
            mustInclude: {},
          },
          new Date('2026-10-12T00:00:00Z'),
        ),
      ),
    ],
    'b.json',
    { type: 'application/json' },
  );

const upload = (file: File) =>
  userEvent.upload(screen.getByLabelText('Choose a backup file to restore'), file);

describe('DataToolsProvider (via the account menu)', () => {
  it('Back up downloads a file that parses back as a backup', async () => {
    replaceAll([job('https://example.com/a', 'A')]);
    setup();
    await chooseAccountItem('Back up');
    expect(downloads).toHaveLength(1);
    expect(downloads[0].name).toMatch(
      new RegExp(`^${BRAND.slug}-backup-\\d{4}-\\d{2}-\\d{2}\\.json$`),
    );
    const r = parseBackup(await downloads[0].blob.text());
    expect(r.ok && r.backup.jobs.map((j) => j.url)).toEqual(['https://example.com/a']);
  });

  it('Back up warns when the file is over what Restore takes (#340)', async () => {
    replaceAll([
      { ...job('https://example.com/a', 'A'), notes: 'x'.repeat(MAX_BACKUP_CHARS) } as Job,
    ]);
    setup();
    await chooseAccountItem('Back up');
    expect(downloads).toHaveLength(1);
    expect(await screen.findByText('This backup is too large to restore')).toBeTruthy();
  });

  it('toasts the reason for an invalid file', async () => {
    setup();
    await upload(new File(['{"nope":1}'], 'x.json', { type: 'application/json' }));
    expect(await screen.findByText(`This file isn't a backup from ${BRAND.name}.`)).toBeTruthy();
  });

  it('Merge applies a valid backup without a safety download', async () => {
    replaceAll([job('https://example.com/keep', 'Keep')]);
    setup();
    await upload(backupFile([job('https://example.com/new', 'New')]));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Backup: 1 job,/)).toBeTruthy();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Merge into my data' }));
    expect(downloads).toHaveLength(0);
    expect(
      getAllJobs()
        .map((j) => j.url)
        .sort(),
    ).toEqual(['https://example.com/keep', 'https://example.com/new']);
  });

  it('counts what Replace changes in plain words, and marks Replace destructive (#338)', async () => {
    replaceAll([job('https://example.com/old', 'Old')]);
    setup();
    await upload(
      backupFile([job('https://example.com/a', 'A'), job('https://example.com/b', 'B')]),
    );
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Backup: 2 jobs, 0 documents')).toBeTruthy();
    expect(within(dialog).getByText('Now: 1 job, 0 documents')).toBeTruthy();
    expect(within(dialog).queryByText(/snippet/)).toBeNull();
    const replace = within(dialog).getByRole('button', { name: 'Replace my data' });
    expect(replace).toHaveClass('bg-feedback-bg-danger', 'text-feedback-danger');
    const results = await axe(dialog, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    });
    expect(results.violations.map((v) => `${v.id} ×${v.nodes.length}`)).toEqual([]);
  });

  it('Replace saves a safety backup first, then replaces', async () => {
    replaceAll([job('https://example.com/old', 'Old')]);
    setup();
    await upload(backupFile([job('https://example.com/new', 'New')]));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Replace my data' }));
    expect(downloads).toHaveLength(1);
    expect(downloads[0].name).toMatch(new RegExp(`^${BRAND.slug}-before-restore-`));
    const safety = parseBackup(await downloads[0].blob.text());
    expect(safety.ok && safety.backup.jobs.map((j) => j.url)).toEqual(['https://example.com/old']);
    expect(getAllJobs().map((j) => j.url)).toEqual(['https://example.com/new']);
  });

  it('says what did not save when browser storage is full (#339)', async () => {
    replaceAll([job('https://example.com/old', 'Old')]);
    setup();
    await upload(backupFile([job('https://example.com/new', 'New')]));
    const dialog = await screen.findByRole('dialog');
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (key === 'rjb_shortlist') throw new DOMException('full', 'QuotaExceededError');
      setItem.call(this, key, value);
    });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Replace my data' }));
    expect(await screen.findByText("Restore didn't fully save")).toBeTruthy();
    expect(
      screen.getByText(
        "Your browser's storage is full, so your jobs weren't saved. Reload to check what was kept. The safety copy of your data from before is in your downloads.",
      ),
    ).toBeTruthy();
  });

  it('Merge that does not fully save points to reload, with no safety copy (#339)', async () => {
    setup();
    await upload(backupFile([job('https://example.com/new', 'New')]));
    const dialog = await screen.findByRole('dialog');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Merge into my data' }));
    expect(
      await screen.findByText(
        /so your jobs, documents, .* weren't saved\. Reload to check what was kept\.$/,
      ),
    ).toBeTruthy();
  });

  it('Export CSV is disabled with no jobs and downloads once there are some', async () => {
    const { unmount } = setup();
    const menu = await openAccount();
    expect(within(menu).getByRole('menuitem', { name: 'Export CSV' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    unmount();
    replaceAll([job('https://example.com/a', 'A')]);
    setup();
    await chooseAccountItem('Export CSV');
    await waitFor(() => expect(downloads[0]?.name).toBe(`${BRAND.slug}.csv`));
  });

  it('has no WCAG A/AA violations', async () => {
    const { container } = setup();
    const results = await axe(container, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    });
    expect(results.violations.map((v) => `${v.id} ×${v.nodes.length}`)).toEqual([]);
  });
});
