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
import {
  addCategory,
  getCurationState,
  removeCategory,
  replaceCurationState,
  updateCategory,
} from '../curation/curationStore';
import { setCurationSyncedAt } from '../curation/syncStatus';
import { clearAllPending } from '../curation/pending';
import { categoryToRow } from '../curation/map';
import { addJob, getAllJobs, removeJob } from '../store';
import { OFFLINE_MSG } from '../cloudMessages';
import { saveTarget, TARGETS_KEY } from '../feed/targets';
import { writeBlob } from '../syncBlob';

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

  it('never pushes the unmerged local copy after a failed pull; a later good pull re-opens pushes (#161)', async () => {
    // Cloud holds a job that only lives there; this device holds a different one.
    addJob('https://cloud.example/jobs/1', 'Cloud only');
    const cloudData = writeBlob({
      jobs: getAllJobs(),
      copydeck: [],
      triage: { pinned: [], dismissed: [] },
      legacyUserTiles: [],
    });
    removeJob('https://cloud.example/jobs/1');
    fake().tables.tracker = [{ user_id: 'u1', data: cloudData, updated_at: NOW }];
    addJob('https://local.example/jobs/2', 'Local only');

    fake().failNext('tracker', 'select');
    renderAccount();
    act(() => fake().signIn('u1'));
    expect(await screen.findByText(OFFLINE_MSG)).toBeInTheDocument();
    // Wait out the 500ms push debounce: the cloud row must be untouched.
    await new Promise((r) => setTimeout(r, 800));
    expect(fake().tables.tracker[0].data).toEqual(cloudData);

    // A successful re-pull (focus) merges, then local edits push again.
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() =>
      expect(getAllJobs().map((j) => j.url)).toContain('https://cloud.example/jobs/1'),
    );
    // The device's local-only job survives recovery: kept locally AND uploaded to the cloud row.
    await waitFor(() => expect(JSON.stringify(fake().tables.tracker[0].data)).toContain('jobs/2'));
    expect(getAllJobs().map((j) => j.url)).toContain('https://local.example/jobs/2');
    addJob('https://local.example/jobs/3', 'After the pull');
    await waitFor(() => expect(JSON.stringify(fake().tables.tracker[0].data)).toContain('jobs/3'));
  });
});

// Tracks never reached the cloud for any account (2026-10-15). These pin the three ways that can
// hurt: a write the cloud refused went unnoticed, a sign-in against an empty cloud could drop this
// browser's tracks, and sign-out wiped tracks that only lived here.
describe('tracks and the cloud (2026-10-15 track-sync audit)', () => {
  beforeEach(() => {
    setCurationSyncedAt(null);
    clearAllPending();
  });
  const localTrack = (id: string, label: string, createdAt = NOW) =>
    replaceCurationState({
      categories: [
        {
          id,
          label,
          titles: ['Design Engineer'],
          atsRoles: [],
          seniority: 'any',
          location: '',
          tailorRole: null,
          sortOrder: 0,
          archived: false,
          createdAt,
          updatedAt: createdAt,
        },
      ],
      groups: [],
      tiles: [],
    });

  it('a track change the cloud refuses is loud: a toast says what and how to fix it', async () => {
    renderAccount();
    act(() => fake().signIn('u1'));
    await waitFor(() => expect(fake().tables.tracker?.length).toBe(1));
    fake().failNext('categories', 'upsert');
    act(() => {
      addCategory({ label: 'Design Systems' });
    });
    expect(await screen.findByText('Track changes didn’t reach the cloud')).toBeInTheDocument();
    expect(
      screen.getByText(/kept on this device.*Retry sync in the Account menu/),
    ).toBeInTheDocument();
    const menu = await openAccount();
    expect(within(menu).getByRole('menuitem', { name: 'Retry sync' })).toBeInTheDocument();
  });

  it('signing in with an empty cloud uploads this browser’s tracks instead of dropping them', async () => {
    localTrack('c1', 'Design Systems');
    // This browser synced once before (an earlier, emptier session), so the track is "older".
    setCurationSyncedAt('2026-10-05T00:00:00.000Z');
    renderAccount();
    act(() => fake().signIn('u1'));
    await waitFor(() =>
      expect(fake().tables.categories?.map((c) => c.label)).toEqual(['Design Systems']),
    );
    expect(getCurationState().categories.map((c) => c.label)).toEqual(['Design Systems']);
  });

  const signedInWithSyncedTrack = async () => {
    renderAccount();
    act(() => fake().signIn('u1'));
    await waitFor(() => expect(fake().tables.tracker?.length).toBe(1));
    act(() => {
      addCategory({ label: 'Design Systems' });
    });
    await waitFor(() => expect(fake().tables.categories?.length).toBe(1));
    return getCurationState().categories[0].id;
  };
  const label = () => getCurationState().categories.map((c) => c.label);
  const cloudLabels = () => (fake().tables.categories ?? []).map((c) => c.label);

  it('a refused EDIT to a synced track is sent by Retry sync, not reverted by the cloud copy', async () => {
    const id = await signedInWithSyncedTrack();
    fake().failNext('categories', 'upsert');
    act(() => updateCategory(id, { label: 'Design Engineering' }));
    await screen.findByText('Track changes didn’t reach the cloud');
    await chooseAccountItem('Retry sync');
    await waitFor(() => expect(cloudLabels()).toEqual(['Design Engineering']));
    expect(label()).toEqual(['Design Engineering']);
  });

  it('a refused DELETE is sent by Retry sync, not brought back by the cloud copy', async () => {
    const id = await signedInWithSyncedTrack();
    fake().failNext('categories', 'delete');
    act(() => removeCategory(id));
    await screen.findByText('Track changes didn’t reach the cloud');
    await chooseAccountItem('Retry sync');
    await waitFor(() => expect(cloudLabels()).toEqual([]));
    expect(label()).toEqual([]);
  });

  it('Retry sync stays in the menu while tracks are unsynced, even after jobs sync fine', async () => {
    await signedInWithSyncedTrack();
    fake().failNext('categories', 'upsert');
    act(() => {
      addCategory({ label: 'Only here' });
    });
    await screen.findByText('Track changes didn’t reach the cloud');
    addJob('https://acme.example/jobs/9', 'Design Engineer');
    await waitFor(() => expect(JSON.stringify(fake().tables.tracker[0].data)).toContain('jobs/9'));
    const menu = await openAccount();
    expect(within(menu).getByRole('menuitem', { name: 'Retry sync' })).toBeInTheDocument();
  });

  it('several refused writes in a burst make one toast, not one each', async () => {
    renderAccount();
    act(() => fake().signIn('u1'));
    await waitFor(() => expect(fake().tables.tracker?.length).toBe(1));
    fake().failNext('categories', 'upsert');
    fake().failNext('categories', 'upsert');
    fake().failNext('categories', 'upsert');
    act(() => {
      addCategory({ label: 'A' });
      addCategory({ label: 'B' });
      addCategory({ label: 'C' });
    });
    await screen.findByText('Track changes didn’t reach the cloud');
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getAllByText('Track changes didn’t reach the cloud')).toHaveLength(1);
  });

  it('sign-out warns before wiping tracks that never reached the cloud; cancel keeps them', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await signedInWithSyncedTrack();
    fake().failNext('categories', 'upsert');
    act(() => {
      addCategory({ label: 'Only here' });
    });
    await screen.findByText('Track changes didn’t reach the cloud');
    await chooseAccountItem('Sign out');
    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/haven’t reached the cloud/));
    expect(label()).toEqual(['Design Systems', 'Only here']);
  });

  it('confirming the warning signs out and wipes this browser', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await signedInWithSyncedTrack();
    fake().failNext('categories', 'upsert');
    act(() => {
      addCategory({ label: 'Only here' });
    });
    await screen.findByText('Track changes didn’t reach the cloud');
    await chooseAccountItem('Sign out');
    await waitFor(() => expect(localStorage.getItem('rjb_curation')).toBeNull());
  });

  it('a track write still in flight counts as unsynced at sign-out', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await signedInWithSyncedTrack();
    const release = fake().holdNext('categories', 'upsert');
    act(() => {
      addCategory({ label: 'In flight' });
    });
    await chooseAccountItem('Sign out');
    expect(confirm).toHaveBeenCalled();
    release();
  });

  // #180 review: outreach targets are local only (not synced), so sign-out's wipe loses them.
  // It says so first, with the count, instead of dropping them silently.
  it('sign-out warns that saved outreach targets are on this device only; cancel keeps them', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await signedInWithSyncedTrack();
    saveTarget('track-1', {
      login: 'acme',
      company: 'Acme',
      repo: 'acme/ds',
      repoUrl: 'https://github.com/acme/ds',
      stars: 900,
    });
    saveTarget('track-1', {
      login: 'globex',
      company: 'Globex',
      repo: 'globex/ds',
      repoUrl: 'https://github.com/globex/ds',
      stars: 400,
    });
    await chooseAccountItem('Sign out');
    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/2 saved outreach targets/));
    expect(localStorage.getItem(TARGETS_KEY)).not.toBeNull();
    localStorage.removeItem(TARGETS_KEY);
  });

  it('with every track synced, sign-out asks nothing', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await signedInWithSyncedTrack();
    await chooseAccountItem('Sign out');
    expect(confirm).not.toHaveBeenCalled();
  });

  it('a session that expired mid-session is loud too, not a silent skip', async () => {
    await signedInWithSyncedTrack();
    // The stored session is still there, but the client no longer returns one (refresh failed).
    localStorage.setItem('sb-test-auth-token', '{}');
    vi.spyOn(fake().client.auth, 'getSession').mockResolvedValue({ data: { session: null } });
    act(() => {
      addCategory({ label: 'After expiry' });
    });
    expect(await screen.findByText('Track changes didn’t reach the cloud')).toBeInTheDocument();
  });
});
