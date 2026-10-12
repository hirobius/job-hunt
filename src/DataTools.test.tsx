import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { ToastProvider } from '@hirobius/design-system';

// The curation store pulls in the Supabase client; stub it so the test stays local + offline.
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getSession: async () => ({ data: { session: null } }) },
    from: () => ({ upsert: async () => ({}), delete: () => ({ eq: async () => ({}) }) }),
  }),
}));

import DataTools from './DataTools';
import { buildBackup, parseBackup } from './backup';
import { getAllJobs, replaceAll } from './store';
import { replaceSnippets } from './copyDeckStore';
import { replaceCurationState } from './curation/curationStore';
import { replaceTriage } from './tileTriage';
import type { Job } from './types';

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

const setup = () =>
  render(
    <ToastProvider>
      <DataTools />
    </ToastProvider>,
  );

const backupFile = (jobs: Job[]) =>
  new File(
    [
      JSON.stringify(
        buildBackup(
          { jobs, copydeck: [], curation: EMPTY, triage: { pinned: [], dismissed: [] } },
          new Date('2026-10-12T00:00:00Z'),
        ),
      ),
    ],
    'b.json',
    { type: 'application/json' },
  );

const upload = (file: File) =>
  userEvent.upload(screen.getByLabelText('Choose a backup file to restore'), file);

describe('DataTools', () => {
  it('Back up downloads a file that parses back as a backup', async () => {
    replaceAll([job('https://example.com/a', 'A')]);
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Back up' }));
    expect(downloads).toHaveLength(1);
    expect(downloads[0].name).toMatch(/^apply-board-backup-\d{4}-\d{2}-\d{2}\.json$/);
    const r = parseBackup(await downloads[0].blob.text());
    expect(r.ok && r.backup.jobs.map((j) => j.url)).toEqual(['https://example.com/a']);
  });

  it('shows the reason for an invalid file', async () => {
    setup();
    await upload(new File(['{"nope":1}'], 'x.json', { type: 'application/json' }));
    expect(await screen.findByText("This isn't an Apply Board backup.")).toBeTruthy();
  });

  it('Merge applies a valid backup without a safety download', async () => {
    replaceAll([job('https://example.com/keep', 'Keep')]);
    setup();
    await upload(backupFile([job('https://example.com/new', 'New')]));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Backup: 1 jobs/)).toBeTruthy();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Merge into my data' }));
    expect(downloads).toHaveLength(0);
    expect(
      getAllJobs()
        .map((j) => j.url)
        .sort(),
    ).toEqual(['https://example.com/keep', 'https://example.com/new']);
  });

  it('Replace saves a safety backup first, then replaces', async () => {
    replaceAll([job('https://example.com/old', 'Old')]);
    setup();
    await upload(backupFile([job('https://example.com/new', 'New')]));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Replace my data' }));
    expect(downloads).toHaveLength(1);
    expect(downloads[0].name).toMatch(/^apply-board-before-restore-/);
    const safety = parseBackup(await downloads[0].blob.text());
    expect(safety.ok && safety.backup.jobs.map((j) => j.url)).toEqual(['https://example.com/old']);
    expect(getAllJobs().map((j) => j.url)).toEqual(['https://example.com/new']);
  });

  it('Export CSV is disabled with no jobs and downloads once there are some', async () => {
    const { unmount } = setup();
    expect((screen.getByRole('button', { name: 'Export CSV' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    unmount();
    replaceAll([job('https://example.com/a', 'A')]);
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    await waitFor(() => expect(downloads[0]?.name).toBe('apply-board.csv'));
  });

  it('has no WCAG A/AA violations', async () => {
    const { container } = setup();
    const results = await axe(container, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    });
    expect(results.violations.map((v) => `${v.id} ×${v.nodes.length}`)).toEqual([]);
  });
});
