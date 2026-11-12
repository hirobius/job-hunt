// #382: a tab that reads a blob written by a newer version of the app must not push. Its
// writeBlob only knows today's fields, so a push would rewrite the row at today's version and
// drop whatever the newer tab added. It stops (like the #288 freeze) and says to reload.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, screen, waitFor } from '@testing-library/react';
import { createFakeSupabase } from '../test/fakeSupabase';
import { loadSupabase } from '../supabase';

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

import {
  renderAccount,
  addDeviceDataIfAsked,
  chooseAccountItem,
  chooseDataAction,
  openAccount,
} from '../test/renderAccount';
import { replaceCurationState } from '../curation/curationStore';
import { addJob, getAllJobs, removeJob } from '../store';
import { TAB_NEWER_VERSION, TAB_SWITCHED } from '../cloudMessages';
import { BLOB_VERSION } from '../syncBlob';
import { freezeTab, resetTabAccount, tabFrozen } from '../tabAccount';
import type { Job } from '../types';

const fake = () => h.fake!;
const AUTH_KEY = 'sb-test-auth-token';
const NEWER = {
  v: BLOB_VERSION + 1,
  jobs: [{ url: 'https://x.example/jobs/new', title: 'From the newer tab', status: 'Saved' }],
  found: [{ id: 'a field this version does not know' }],
};

const row = () => (fake().tables.tracker ?? []).find((r) => r.user_id === 'x');
const settle = () => act(() => new Promise((r) => setTimeout(r, 800))); // past the push debounce

function signInAsX() {
  renderAccount();
  localStorage.setItem(AUTH_KEY, JSON.stringify({ access_token: 't', user: { id: 'x' } }));
  act(() => fake().signIn('x'));
}

beforeEach(async () => {
  await loadSupabase();
  fake().reset();
  replaceCurationState({ categories: [], groups: [], tiles: [] });
});
afterEach(() => {
  cleanup();
  getAllJobs()
    .slice()
    .forEach((j) => removeJob(j.url));
  resetTabAccount(); // lift the storage guard, then drop this test's sync base and stores
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('a newer blob version in the cloud (#382)', () => {
  it('on sign-in: nothing is pushed or adopted, and the tab says to reload', async () => {
    fake().tables.tracker = [{ user_id: 'x', data: structuredClone(NEWER) }];
    act(() => {
      addJob('https://x.example/jobs/local', 'Only on this device');
    });
    signInAsX();
    await addDeviceDataIfAsked();

    expect(await screen.findByText(TAB_NEWER_VERSION)).toBeInTheDocument();
    expect(tabFrozen()).toBe('newerVersion');
    act(() => {
      addJob('https://x.example/jobs/later', 'Edited after');
    });
    await settle();
    expect(row()!.data).toEqual(NEWER);
    // Not merged in either: this version would read it without the fields it doesn't know.
    expect(getAllJobs().map((j: Job) => j.url)).not.toContain('https://x.example/jobs/new');
    // Later edits stay in this tab: the newer tab owns shared storage now.
    expect(localStorage.getItem('rjb_shortlist')).not.toContain('jobs/later');
  });

  it('on a re-pull: a newer tab wrote since, so this tab stops before its next push', async () => {
    signInAsX();
    await addDeviceDataIfAsked();
    act(() => {
      addJob('https://x.example/jobs/1', 'Before');
    });
    await waitFor(() => expect(row()?.data.v).toBe(BLOB_VERSION));

    // The newer tab writes; this tab is focused (a re-pull), then edits.
    row()!.data = structuredClone(NEWER);
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(await screen.findByText(TAB_NEWER_VERSION)).toBeInTheDocument();
    act(() => {
      addJob('https://x.example/jobs/2', 'After');
    });
    await settle();
    expect(row()!.data).toEqual(NEWER);
    expect(tabFrozen()).toBe('newerVersion');
  });

  it('the same or an older version still syncs as before', async () => {
    fake().tables.tracker = [{ user_id: 'x', data: { v: BLOB_VERSION, jobs: [] } }];
    signInAsX();
    await addDeviceDataIfAsked();
    act(() => {
      addJob('https://x.example/jobs/1', 'Before');
    });
    await waitFor(() =>
      expect((row()!.data.jobs as Job[]).map((j) => j.url)).toEqual(['https://x.example/jobs/1']),
    );
    expect(tabFrozen()).toBeNull();
    expect(screen.queryByText(TAB_NEWER_VERSION)).toBeNull();
  });

  /** A newer blob on sign-in: the tab is stopped, with this device's job unsynced. */
  async function stoppedByNewer() {
    fake().tables.tracker = [{ user_id: 'x', data: structuredClone(NEWER) }];
    act(() => {
      addJob('https://x.example/jobs/local', 'Only on this device');
    });
    signInAsX();
    await addDeviceDataIfAsked();
    expect(await screen.findByText(TAB_NEWER_VERSION)).toBeInTheDocument();
    const signOut = vi.spyOn(fake().client.auth, 'signOut');
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    return { signOut, reload };
  }

  it('Sign out still signs out (a reload alone would stop again), and pushes nothing', async () => {
    const { signOut, reload } = await stoppedByNewer();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await chooseAccountItem('Sign out');
    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(confirm).toHaveBeenCalled(); // this device's job never reached the cloud: asked first
    expect(signOut).toHaveBeenCalled();
    expect(localStorage.getItem('rjb_shortlist') ?? '').not.toContain('jobs/local');
    expect(row()!.data).toEqual(NEWER);
  });

  it('Delete my data still deletes', async () => {
    const { signOut } = await stoppedByNewer();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await chooseDataAction('Delete my data');
    await waitFor(() => expect(signOut).toHaveBeenCalled());
    expect(row()).toBeUndefined();
  });

  it('a Delete my data that fails to delete the blob stays stopped (no push over it)', async () => {
    await stoppedByNewer();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fake().failNext('tracker', 'delete');
    await chooseDataAction('Delete my data');
    await waitFor(() => expect(tabFrozen()).toBe('newerVersion'));
    act(() => {
      addJob('https://x.example/jobs/after-delete', 'After');
    });
    await settle();
    expect(row()!.data).toEqual(NEWER);
  });

  it('an account switch in another tab after it still says so', async () => {
    await stoppedByNewer();
    act(() => freezeTab('switched'));
    expect(tabFrozen()).toBe('switched');
    await openAccount(); // the toast was shown once; the menu line follows the reason
    expect(await screen.findByText(TAB_SWITCHED)).toBeInTheDocument();
  });
});
