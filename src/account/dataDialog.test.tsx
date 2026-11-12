// The Data dialog (#550): the Account menu's one Data item opens it; it holds back up, restore,
// export, Recently removed and the repairs, each a key with an icon and one line on what it does.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';

import { createFakeSupabase } from '../test/fakeSupabase';

const h = vi.hoisted(() => ({ fake: null as null | ReturnType<typeof createFakeSupabase> }));
vi.mock('@supabase/supabase-js', async () => {
  const { createFakeSupabase } = await import('../test/fakeSupabase');
  return {
    createClient: () => {
      h.fake = createFakeSupabase();
      return h.fake.client;
    },
  };
});

import { loadSupabase } from '../supabase';
import { addDeviceDataIfAsked, openAccount, openData, renderAccount } from '../test/renderAccount';
import { addJob, getAllJobs, replaceAll } from '../store';
import { replaceTrash } from '../trash';

const fake = () => h.fake!;

/** The dialog's keys, top to bottom. */
const keys = (dialog: HTMLElement) =>
  within(dialog)
    .getAllByRole('button')
    .map((b) => b.textContent?.trim())
    .filter((t) => t && t !== 'Close');

beforeEach(async () => {
  await loadSupabase();
  fake().reset();
  replaceAll([]);
  replaceTrash([]);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Data dialog (#550)', () => {
  it('the Account menu has one Data item and none of the moved actions', async () => {
    renderAccount();
    const menu = await openAccount();
    expect(within(menu).getByRole('menuitem', { name: 'Data' })).toBeInTheDocument();
    for (const name of [
      'Back up',
      'Restore…',
      'Export CSV',
      'Export links',
      'Reload app',
      'Reset local data…',
      'Delete my data',
    ])
      expect(within(menu).queryByRole('menuitem', { name })).toBeNull();
    expect(within(menu).queryByText('Troubleshooting')).toBeNull();
  });

  it('signed out with no jobs: back up, restore, export, then the device repairs and the sample', async () => {
    renderAccount();
    const dialog = await openData();
    expect(keys(dialog)).toEqual([
      'Back up',
      'Restore…',
      'Export CSV',
      'Export links',
      'Try with sample data',
      'Reload app',
      'Reset local data…',
    ]);
    // Two named groups, each a list (no cards): headings are h2 in a dialog (the page keeps its h1).
    expect(within(dialog).getByRole('heading', { level: 2, name: 'Your data' })).toBeVisible();
    expect(within(dialog).getByRole('heading', { level: 2, name: 'This device' })).toBeVisible();
    // Each key says what it does, as its description; exports wait for a job.
    expect(within(dialog).getByRole('button', { name: 'Back up' })).toHaveAccessibleDescription(
      'Download every job, document and setting as one file.',
    );
    expect(within(dialog).getByRole('button', { name: 'Export CSV' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Export links' })).toBeDisabled();
    // Reset is the danger tone; it is a sheet below sm (the class), a dialog above.
    expect(within(dialog).getByRole('button', { name: 'Reset local data…' })).toHaveClass(
      'text-feedback-danger',
    );
    expect(dialog).toHaveClass('rjb-bottom-sheet');
  });

  it('Try with sample data fills Apply and closes the dialog', async () => {
    renderAccount();
    const dialog = await openData();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Try with sample data' }));
    await waitFor(() => expect(getAllJobs().length).toBeGreaterThan(0));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Data' })).toBeNull());
    expect(window.location.hash).toMatch(/^#\/apply/);
  });

  it('with jobs: no sample offer, exports on, Recently removed with its count', async () => {
    addJob('https://acme.example/jobs/1', 'Design Engineer');
    replaceTrash([
      {
        job: { url: 'https://acme.example/jobs/2', label: 'Welder', status: 'Saved' },
        removedAt: new Date().toISOString(),
      },
    ]);
    renderAccount();
    const dialog = await openData();
    expect(within(dialog).queryByRole('button', { name: 'Try with sample data' })).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Export CSV' })).toBeEnabled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Recently removed (1)' }));
    // Data closes first; Recently removed takes its place.
    expect(await screen.findByRole('dialog', { name: 'Recently removed' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Data' })).toBeNull();
  });

  it('signed in: Delete my data last, no sample offer', async () => {
    renderAccount();
    act(() => fake().signIn('u1'));
    await addDeviceDataIfAsked();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Account' }).textContent).toBe('U'),
    );
    const dialog = await openData();
    const all = keys(dialog);
    expect(all[all.length - 1]).toBe('Delete my data');
    expect(all).not.toContain('Try with sample data');
  });

  it('has no WCAG A/AA violations', async () => {
    renderAccount();
    const dialog = await openData();
    const results = await axe(dialog, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    });
    expect(results.violations).toEqual([]);
  });
});
