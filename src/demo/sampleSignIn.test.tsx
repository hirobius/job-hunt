// Sample data never reaches an account (#107, "Clean first run"): the sample's jobs were kept out
// of the blob, but its "Sample" track is a real track, so a sign-in asked to add "this device's
// saved data" and then uploaded the track (and its watched boards and targets): every other
// device signed in to that account showed a Sample track nobody made. A sign-in drops it first.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { ToastProvider } from '@hirobius/design-system';
import { fakeAccessToken } from '../test/fakeSupabase';
import { rememberSignInRequest } from '../account/authLink';

const h = vi.hoisted(() => ({
  fake: null as null | ReturnType<typeof import('../test/fakeSupabase').createFakeSupabase>,
}));
vi.mock('@supabase/supabase-js', async () => {
  const { createFakeSupabase } = await import('../test/fakeSupabase');
  return {
    createClient: () => {
      h.fake = createFakeSupabase();
      return h.fake.client;
    },
  };
});

const ME = 'me@example.test';
const link = `#access_token=${fakeAccessToken(ME)}&refresh_token=r&expires_in=3600&token_type=bearer&type=magiclink`;

beforeEach(() => {
  h.fake = null;
  localStorage.clear();
  vi.resetModules(); // authFragment reads the URL once per load: each test boots a fresh app
});
afterEach(async () => {
  cleanup();
  await new Promise((r) => setTimeout(r, 50));
  history.replaceState(null, '', '/');
});

/** Load the sample on this (signed-out) device, then boot the account seam with a sign-in link. */
async function sampleThenSignIn() {
  // The address first: the auth fragment is read once, when the modules load.
  history.replaceState(null, '', '/' + link);
  const { loadSample } = await import('./loadSample');
  const { getCurationState } = await import('../curation/curationStore');
  expect(loadSample()).toBe(true);
  expect(getCurationState().categories.map((c) => c.label)).toEqual(['Sample']);
  rememberSignInRequest(ME);
  const { default: CloudSyncProvider } = await import('../account/CloudSyncProvider');
  const { useCloudSync } = await import('../account/accountContext');
  function Probe() {
    const { user, settled } = useCloudSync();
    return <span>{user ? `in:${user.email}:${settled ? 'settled' : 'pulling'}` : 'out'}</span>;
  }
  render(
    <ToastProvider>
      <CloudSyncProvider>
        <Probe />
      </CloudSyncProvider>
    </ToastProvider>,
  );
}

describe('signing in on a device holding only the sample', () => {
  it('asks nothing: the sample is not "this device\'s data"', async () => {
    await sampleThenSignIn();
    expect(await screen.findByText(`in:${ME}:settled`)).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add to account' })).toBeNull();
  });

  it('never uploads the Sample track, its links or its targets', async () => {
    await sampleThenSignIn();
    expect(await screen.findByText(`in:${ME}:settled`)).toBeInTheDocument();
    await waitFor(() => expect(h.fake!.tables.tracker ?? []).toHaveLength(1));
    // Let any curation write the sign-in started land before looking.
    await new Promise((r) => setTimeout(r, 50));
    expect(h.fake!.tables.categories ?? []).toEqual([]);
    expect(h.fake!.tables.groups ?? []).toEqual([]);
    expect(h.fake!.tables.tiles ?? []).toEqual([]);
    const blob = h.fake!.tables.tracker[0].data;
    expect(blob.jobs).toEqual([]);
    expect(Object.values(blob.targets ?? {}).flat()).toEqual([]);
    // The sample's jobs stay on this device (they always did); its track is gone with the sign-in.
    const { getAllJobs } = await import('../store');
    const { getCurationState } = await import('../curation/curationStore');
    expect(getAllJobs().length).toBeGreaterThan(0);
    expect(getCurationState().categories).toEqual([]);
  });

  it('a device that already syncs with the account does not upload it either', async () => {
    localStorage.setItem('rjb_sync_base', JSON.stringify({ uid: `id-${ME}`, keys: {} }));
    await sampleThenSignIn();
    expect(await screen.findByText(`in:${ME}:settled`)).toBeInTheDocument();
    await waitFor(() => expect(h.fake!.tables.tracker ?? []).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 50));
    expect(h.fake!.tables.categories ?? []).toEqual([]);
    expect(h.fake!.tables.tiles ?? []).toEqual([]);
  });
});
