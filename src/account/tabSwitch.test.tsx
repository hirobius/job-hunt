// #288: two tabs share this browser's stores (`rjb_*`) and its Supabase session, but each holds
// its own data in memory. Tab A is the real provider here; tab B is everything it shares with
// tab A: the stored session (localStorage `sb-…-auth-token`, its storage event), supabase-js's
// cross-tab broadcast of auth events, and the cloud tables. A switch in tab B must never let tab
// A's later edits reach the other account.
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

import { renderAccount, addDeviceDataIfAsked, chooseAccountItem } from '../test/renderAccount';
import { addCategory, getCurationState, replaceCurationState } from '../curation/curationStore';
import { addJob, getAllJobs, removeJob } from '../store';
import { TAB_SIGNED_OUT, TAB_SWITCHED } from '../cloudMessages';
import { tabFrozen } from '../tabAccount';
import type { Job } from '../types';

const fake = () => h.fake!;
const AUTH_KEY = 'sb-test-auth-token';

/** What tab B does to the session both tabs share: `user` signs in (null: signs out). */
function tabB(
  user: string | null,
  {
    event,
    relay = true,
    storage = true,
  }: { event?: string; relay?: boolean; storage?: boolean } = {},
) {
  const raw = user ? JSON.stringify({ access_token: 't', user: { id: user } }) : null;
  act(() => {
    fake().otherTab(user, event, relay);
    if (!storage) return;
    const oldValue = localStorage.getItem(AUTH_KEY);
    if (raw) localStorage.setItem(AUTH_KEY, raw);
    else localStorage.removeItem(AUTH_KEY);
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: AUTH_KEY,
        oldValue,
        newValue: raw,
        storageArea: localStorage,
      }),
    );
  });
}

const rowsFor = (table: string, uid: string) =>
  (fake().tables[table] ?? []).filter((r) => r.user_id === uid);
const trackerUrls = (uid: string) =>
  ((rowsFor('tracker', uid)[0]?.data.jobs ?? []) as Job[]).map((j) => j.url);
const settle = () => act(() => new Promise((r) => setTimeout(r, 800))); // past the push debounce

/** Tab A signed in as X with one job and one track in the cloud; Y's cloud copy holds its own. */
async function tabASignedInAsX() {
  fake().tables.tracker = [{ user_id: 'y', data: { v: 10, jobs: [] } }];
  renderAccount();
  localStorage.setItem(AUTH_KEY, JSON.stringify({ access_token: 't', user: { id: 'x' } }));
  act(() => fake().signIn('x'));
  await addDeviceDataIfAsked();
  act(() => {
    addJob('https://x.example/jobs/1', 'Before');
    addCategory({ label: 'X track' });
  });
  await waitFor(() => expect(trackerUrls('x')).toEqual(['https://x.example/jobs/1']));
  await waitFor(() => expect(rowsFor('categories', 'x')).toHaveLength(1));
}

/** Tab A edits jobs and tracks, then is focused (a re-pull) and its Retry sync is chosen. */
async function tabAEditsLater() {
  act(() => {
    addJob('https://x.example/jobs/2', 'After');
    addCategory({ label: 'Made after the switch' });
  });
  act(() => {
    window.dispatchEvent(new Event('focus'));
  });
  await settle();
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
  localStorage.removeItem(AUTH_KEY);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('an account switch in another tab (#288)', () => {
  it.each([
    ['relayed by the auth broadcast and the storage event', { relay: true, storage: true }],
    ['seen only as a storage event', { relay: false, storage: true }],
    ['with no event at all (the shared session just names Y)', { relay: false, storage: false }],
  ])('%s: tab A never writes to Y, and says to reload', async (_how, opts) => {
    await tabASignedInAsX();
    const jobsInStorage = localStorage.getItem('rjb_shortlist');

    tabB('y', opts);
    await tabAEditsLater();

    expect(rowsFor('categories', 'y')).toEqual([]);
    expect(rowsFor('groups', 'y')).toEqual([]);
    expect(rowsFor('tiles', 'y')).toEqual([]);
    expect(rowsFor('tracker', 'y')).toEqual([{ user_id: 'y', data: { v: 10, jobs: [] } }]);
    // Nor to X under Y's session: nothing more is sent at all.
    expect(trackerUrls('x')).toEqual(['https://x.example/jobs/1']);
    expect(tabFrozen()).toBe('switched');
    expect(await screen.findByText(TAB_SWITCHED)).toBeInTheDocument();
    // Once tab A has heard, its later edits stay out of shared storage, where tab B (or a reload)
    // would sync them. With no event at all, it hears only at its first send, after that edit.
    if (opts.storage || opts.relay)
      expect(localStorage.getItem('rjb_shortlist')).toBe(jobsInStorage);
    act(() => {
      addJob('https://x.example/jobs/3', 'Later still');
    });
    expect(localStorage.getItem('rjb_shortlist')).not.toContain('jobs/3');
    // The edit is kept on screen in tab A; the reload starts from what tab B left.
    expect(getCurationState().categories.map((c) => c.label)).toContain('Made after the switch');
  });

  it('a sign-out in tab B makes tab A stop syncing', async () => {
    await tabASignedInAsX();
    tabB(null);
    expect(await screen.findByText(TAB_SIGNED_OUT)).toBeInTheDocument();
    await tabAEditsLater();
    expect(tabFrozen()).toBe('signedOut');
    expect(trackerUrls('x')).toEqual(['https://x.example/jobs/1']);
    expect(rowsFor('categories', 'x')).toHaveLength(1);

    // …and tab B signing in as Y next changes nothing for Y either.
    tabB('y');
    act(() => {
      addCategory({ label: 'Even later' });
    });
    await settle();
    expect(rowsFor('categories', 'y')).toEqual([]);
    expect(rowsFor('tracker', 'y')).toEqual([{ user_id: 'y', data: { v: 10, jobs: [] } }]);
    expect(tabFrozen()).toBe('switched');
  });

  it('a session it cannot read (offline, the refresh failed) skips the send but never stops the tab', async () => {
    await tabASignedInAsX();
    // The laptop wakes offline after an hour: supabase-js's refresh fails, so getSession returns
    // no session plus an error. That says nothing about another tab.
    const getSession = vi
      .spyOn(fake().client.auth, 'getSession')
      .mockResolvedValue({ data: { session: null }, error: new Error('Failed to fetch') } as never);
    await tabAEditsLater();
    expect(tabFrozen()).toBeNull();
    expect(screen.queryByText(TAB_SIGNED_OUT)).toBeNull();
    expect(trackerUrls('x')).toEqual(['https://x.example/jobs/1']);
    expect(localStorage.getItem('rjb_shortlist')).toContain('jobs/2');

    // The network comes back: tab A's own refresh goes through and the edit reaches X.
    getSession.mockRestore();
    tabB('x', { event: 'TOKEN_REFRESHED' });
    await tabAEditsLater();
    expect(tabFrozen()).toBeNull();
    await waitFor(() => expect(trackerUrls('x')).toContain('https://x.example/jobs/2'));
    act(() => {
      addJob('https://x.example/jobs/3', 'Later still');
    });
    expect(localStorage.getItem('rjb_shortlist')).toContain('jobs/3');
  });

  it('a definite sign-out seen only at a send (no event, no error) still stops the tab', async () => {
    await tabASignedInAsX();
    tabB(null, { relay: false, storage: false });
    await tabAEditsLater();
    expect(tabFrozen()).toBe('signedOut');
    expect(trackerUrls('x')).toEqual(['https://x.example/jobs/1']);
  });

  it('a same-user token refresh in tab B changes nothing in tab A', async () => {
    await tabASignedInAsX();
    tabB('x', { event: 'TOKEN_REFRESHED' });
    await tabAEditsLater();
    expect(tabFrozen()).toBeNull();
    expect(screen.queryByText(TAB_SWITCHED)).toBeNull();
    await waitFor(() =>
      expect(trackerUrls('x')).toEqual(['https://x.example/jobs/1', 'https://x.example/jobs/2']),
    );
    await waitFor(() => expect(rowsFor('categories', 'x')).toHaveLength(2));
  });

  it.each([
    ['relayed by the auth broadcast and the storage event', { relay: true, storage: true }],
    ['seen only as a storage event', { relay: false, storage: true }],
    ['seen only as the auth broadcast', { relay: true, storage: false }],
  ])(
    'the same account signing in again elsewhere keeps tab A out of shared storage too (%s)',
    async (_how, opts) => {
      await tabASignedInAsX();
      tabB(null, opts);
      // X signs in again in another tab, which pulls the cloud copy (a job added on the phone) and
      // stores it along with X's sync base. Tab A's copy predates that job: writing it to shared
      // storage would make the next load read the phone's job as removed here, and remove it.
      const phone = JSON.stringify([
        { url: 'https://x.example/jobs/1', label: 'Before', status: 'Saved' },
        { url: 'https://x.example/jobs/phone', label: 'From the phone', status: 'Saved' },
      ]);
      localStorage.setItem('rjb_shortlist', phone);
      tabB('x', opts);
      act(() => {
        addJob('https://x.example/jobs/later', 'Later in tab A');
      });
      expect(localStorage.getItem('rjb_shortlist')).toBe(phone);
      expect(tabFrozen()).not.toBeNull();
    },
  );

  /** Tab A's own sign-out and reload, watched: tab B's account must stay signed in. */
  function watchSignOut() {
    const signOut = vi.spyOn(fake().client.auth, 'signOut');
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    return { signOut, reload };
  }

  it('Delete my data confirmed after tab B switched to Y deletes nothing and keeps Y signed in', async () => {
    await tabASignedInAsX();
    const { signOut, reload } = watchSignOut();
    // The person leaves the confirm open, switches account in tab B, comes back and says OK.
    vi.spyOn(window, 'confirm').mockImplementation(() => {
      tabB('y');
      return true;
    });
    await chooseAccountItem('Delete my data');
    await settle();
    expect(signOut).not.toHaveBeenCalled();
    expect(trackerUrls('x')).toEqual(['https://x.example/jobs/1']);
    expect(rowsFor('categories', 'x')).toHaveLength(1);
    expect(rowsFor('tracker', 'y')).toEqual([{ user_id: 'y', data: { v: 10, jobs: [] } }]);
    expect(reload).not.toHaveBeenCalled();
    expect(await screen.findByText(TAB_SWITCHED)).toBeInTheDocument();
  });

  it('Sign out after tab B switched to Y, unheard until the flush, reloads without signing Y out', async () => {
    await tabASignedInAsX();
    const { signOut, reload } = watchSignOut();
    act(() => {
      addJob('https://x.example/jobs/2', 'Not sent yet');
    });
    tabB('y', { relay: false, storage: false });
    vi.spyOn(window, 'confirm').mockReturnValue(true); // sign out with unsynced changes: yes
    await chooseAccountItem('Sign out');
    await settle();
    expect(signOut).not.toHaveBeenCalled();
    expect(trackerUrls('y')).toEqual([]);
    expect(tabFrozen()).toBe('switched');
    expect(reload).toHaveBeenCalled();
  });
});
