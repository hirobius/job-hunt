import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createFakeSupabase } from './test/fakeSupabase';

// Count every createClient call app-wide: the app must build exactly ONE Supabase client (#99).
const h = vi.hoisted(() => ({
  calls: 0,
  fake: null as null | ReturnType<typeof createFakeSupabase>,
}));
vi.mock('@supabase/supabase-js', async () => {
  const { createFakeSupabase } = await import('./test/fakeSupabase');
  return {
    createClient: () => {
      h.calls += 1;
      h.fake = createFakeSupabase();
      return h.fake.client;
    },
  };
});

import CloudSync from './CloudSync';
import { getCurationState, replaceCurationState } from './curation/curationStore';
import { categoryToRow } from './curation/map';
import { addJob, getAllJobs, removeJob } from './store';
import { OFFLINE_MSG } from './cloudMessages';

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

describe('CloudSync', () => {
  it('the whole app shares one Supabase client', async () => {
    await import('./curation/curationStore');
    await import('./curation/sync');
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
    render(<CloudSync />);
    act(() => fake().signIn('u1'));
    await waitFor(() =>
      expect(getCurationState().categories.map((c) => c.label)).toEqual(['Design Systems']),
    );
    await screen.findByText(/Synced · u1@example.test/);
    // …and the tracker blob it pushed is v4 (no pillars / userTiles).
    expect(fake().tables.tracker[0].data).toMatchObject({ v: 4 });
    expect(fake().tables.tracker[0].data).not.toHaveProperty('pillars');
  });

  it('a failed pull shows the actionable offline message with Retry', async () => {
    fake().failNext('tracker', 'select');
    render(<CloudSync />);
    act(() => fake().signIn('u1'));
    expect(await screen.findByText(OFFLINE_MSG)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('Delete my data reports a failed delete and keeps the local copy', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    addJob('https://acme.example/jobs/1', 'Design Engineer');
    render(<CloudSync />);
    act(() => fake().signIn('u1'));
    await screen.findByText(/Synced · /);
    fake().failNext('groups', 'delete');
    await userEvent.click(screen.getByRole('button', { name: 'Delete my data' }));
    expect(await screen.findByText(/Deleted 3 of 4 — couldn't delete groups/)).toBeInTheDocument();
    expect(getAllJobs()).toHaveLength(1);
  });
});
