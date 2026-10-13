import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import { createFakeSupabase } from '../test/fakeSupabase';

// Count every createClient call app-wide: the app must build exactly ONE Supabase client (#99).
const h = vi.hoisted(() => ({
  calls: 0,
  fake: null as null | ReturnType<typeof createFakeSupabase>,
}));
vi.mock('@supabase/supabase-js', async () => {
  const { createFakeSupabase } = await import('../test/fakeSupabase');
  return {
    createClient: () => {
      h.calls += 1;
      h.fake = createFakeSupabase();
      return h.fake.client;
    },
  };
});

import { renderAccount, openAccount, chooseAccountItem } from '../test/renderAccount';
import { getCurationState, replaceCurationState } from '../curation/curationStore';
import { categoryToRow } from '../curation/map';
import { addJob, getAllJobs, removeJob } from '../store';
import { OFFLINE_MSG } from '../cloudMessages';

const fake = () => h.fake!;
const NOW = '2026-10-01T00:00:00.000Z';

beforeEach(() => {
  fake().reset();
  replaceCurationState({ categories: [], groups: [], tiles: [] });
});
afterEach(() => {
  cleanup();
  getAllJobs()
    .slice()
    .forEach((j) => removeJob(j.url));
  vi.restoreAllMocks();
});

describe('CloudSyncProvider (via the account menu)', () => {
  it('the whole app shares one Supabase client', async () => {
    await import('../curation/curationStore');
    await import('../curation/sync');
    expect(h.calls).toBe(1);
  });

  it('signing in restores tracks from the cloud (sign-out wiped them locally)', async () => {
    fake().tables.categories = [
      categoryToRow(
        {
          id: 'c1',
          label: 'Design Systems',
          titles: ['Design Engineer'],
          atsRoles: [],
          seniority: 'any',
          location: '',
          tailorRole: null,
          sortOrder: 0,
          archived: false,
          createdAt: NOW,
          updatedAt: NOW,
        },
        'u1',
      ),
    ];
    renderAccount();
    act(() => fake().signIn('u1'));
    await waitFor(() =>
      expect(getCurationState().categories.map((c) => c.label)).toEqual(['Design Systems']),
    );
    await waitFor(() => expect(fake().tables.tracker?.length).toBe(1));
    const menu = await openAccount();
    expect(within(menu).getByText(/Synced · u1@example.test/)).toBeInTheDocument();
    // …and the tracker blob it pushed is v4 (no pillars / userTiles).
    expect(fake().tables.tracker[0].data).toMatchObject({ v: 4 });
    expect(fake().tables.tracker[0].data).not.toHaveProperty('pillars');
  });

  it('a failed pull toasts the actionable offline message, with Retry in the menu', async () => {
    fake().failNext('tracker', 'select');
    renderAccount();
    act(() => fake().signIn('u1'));
    expect(await screen.findByText(OFFLINE_MSG)).toBeInTheDocument();
    const menu = await openAccount();
    expect(within(menu).getByRole('menuitem', { name: 'Retry sync' })).toBeInTheDocument();
  });

  it('toasts once per outage, not on every focus re-pull that fails again', async () => {
    fake().failNext('tracker', 'select');
    fake().failNext('tracker', 'select');
    renderAccount();
    act(() => fake().signIn('u1'));
    expect(await screen.findByText(OFFLINE_MSG)).toBeInTheDocument();
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() => expect(screen.getAllByText('Sync paused')).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getAllByText('Sync paused')).toHaveLength(1);
  });

  it('Delete my data reports a failed delete and keeps the local copy', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    addJob('https://acme.example/jobs/1', 'Design Engineer');
    renderAccount();
    act(() => fake().signIn('u1'));
    await waitFor(() => expect(fake().tables.tracker?.length).toBe(1));
    fake().failNext('groups', 'delete');
    await chooseAccountItem('Delete my data');
    expect(await screen.findByText(/Deleted 3 of 4 — couldn't delete groups/)).toBeInTheDocument();
    expect(getAllJobs()).toHaveLength(1);
  });
});
