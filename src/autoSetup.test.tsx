// The auto profile (no setup screen, 2026-10-29) is not the person's data: signing in never asks
// to add it, never uploads it over the account's profile, and drops it so the account's wins.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { ToastProvider } from '@hirobius/design-system';
import { fakeAccessToken } from './test/fakeSupabase';
import { rememberSignInRequest } from './account/authLink';

const h = vi.hoisted(() => ({
  fake: null as null | ReturnType<typeof import('./test/fakeSupabase').createFakeSupabase>,
}));
vi.mock('@supabase/supabase-js', async () => {
  const { createFakeSupabase } = await import('./test/fakeSupabase');
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

/** A signed-out first visit's auto profile, then the account seam booted with a sign-in link. */
async function autoThenSignIn() {
  history.replaceState(null, '', '/' + link);
  const { ensureProfile } = await import('./searchDefaults');
  const { getProfile } = await import('./profile');
  expect(ensureProfile()).toBeGreaterThan(20);
  expect(getProfile()?.auto).toBe(true);
  rememberSignInRequest(ME);
  const { default: CloudSyncProvider } = await import('./account/CloudSyncProvider');
  const { useCloudSync } = await import('./account/accountContext');
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

describe('signing in on a device holding only the auto profile', () => {
  it('asks nothing and drops it: the auto profile is not "this device\'s data"', async () => {
    await autoThenSignIn();
    expect(await screen.findByText(`in:${ME}:settled`)).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add to account' })).toBeNull();
    const { getProfiles } = await import('./profile');
    const { getSources } = await import('./sources');
    expect(getProfiles()).toEqual([]);
    expect(getSources().filter((s) => s.auto)).toEqual([]);
  });

  it('never uploads it over the account', async () => {
    await autoThenSignIn();
    expect(await screen.findByText(`in:${ME}:settled`)).toBeInTheDocument();
    await waitFor(() => expect(h.fake!.tables.tracker ?? []).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 50));
    const blob = h.fake!.tables.tracker[0].data;
    expect(blob.profiles ?? []).toEqual([]);
    expect((blob.sources ?? []).filter((s: { auto?: boolean }) => s.auto)).toEqual([]);
  });
});

describe('the mark', () => {
  it('a save or change by the person drops it, so their profile is theirs', async () => {
    const { ensureProfile } = await import('./searchDefaults');
    const { getProfile, replaceProfiles, saveProfile, updateProfile } = await import('./profile');
    ensureProfile();
    updateProfile({ leaveOut: ['Intern'] });
    expect(getProfile()?.auto).toBeUndefined();
    replaceProfiles([]);
    ensureProfile();
    expect(getProfile()?.auto).toBe(true);
    saveProfile({ titles: ['Design Systems Lead'] });
    expect(getProfile()?.auto).toBeUndefined();
  });

  it('a Save of the Search profile with nothing changed keeps it auto', async () => {
    const { ensureProfile, draftOf, fieldsOf } = await import('./searchDefaults');
    const { getProfile, saveProfile, updateProfile } = await import('./profile');
    ensureProfile();
    saveProfile(fieldsOf(draftOf(getProfile()!)));
    expect(getProfile()?.auto).toBe(true);
    updateProfile({ leaveOut: [] });
    expect(getProfile()?.auto).toBe(true);
  });

  it("a starred or muted starter company is the person's", async () => {
    const { deviceData } = await import('./account/deviceData');
    const { emptyBlob } = await import('./syncBlob');
    const { seedSources } = await import('./searchDefaults');
    const [s] = seedSources({ auto: true });
    const blob = { ...emptyBlob(), sources: [s] };
    expect(deviceData(blob, 0).any).toBe(false);
    expect(deviceData({ ...blob, sources: [{ ...s, star: true as const }] }, 0).any).toBe(true);
  });
});

// Adrian's phone test (2026-11-12): a fresh device that opened Find and Apply signed out, showing
// "Track your first job", was asked "Add this device's saved data to …?" after signing in.
describe('the merge guard on a fresh device', () => {
  async function firstRunBlob() {
    const { ensureProfile, draftOf, fieldsOf } = await import('./searchDefaults');
    const { getProfile, getProfiles, saveProfile } = await import('./profile');
    const { getSources } = await import('./sources');
    const { emptyBlob } = await import('./syncBlob');
    ensureProfile();
    // Opened the Search profile from the Account menu and pressed Save, changing nothing.
    saveProfile(fieldsOf(draftOf(getProfile()!)));
    return { ...emptyBlob(), profiles: getProfiles(), sources: getSources() };
  }

  it('only the first-run defaults: no question', async () => {
    const { deviceData } = await import('./account/deviceData');
    expect(deviceData(await firstRunBlob(), 0)).toEqual({ jobs: 0, any: false });
  });

  it('one job the person saved: asks, and names it', async () => {
    const { deviceData } = await import('./account/deviceData');
    const blob = await firstRunBlob();
    const job = { url: 'https://boards.greenhouse.io/x/jobs/1', label: 'Design Systems Lead' };
    expect(deviceData({ ...blob, jobs: [job as never] }, 0)).toEqual({ jobs: 1, any: true });
  });

  it('a profile the person edited: asks', async () => {
    const { deviceData } = await import('./account/deviceData');
    const { updateProfile, getProfiles } = await import('./profile');
    const blob = await firstRunBlob();
    updateProfile({ leaveOut: ['Intern'] });
    expect(deviceData({ ...blob, profiles: getProfiles() }, 0).any).toBe(true);
  });

  it('signing in after the first run signed out asks nothing', async () => {
    history.replaceState(null, '', '/' + link);
    await firstRunBlob();
    rememberSignInRequest(ME);
    const { default: CloudSyncProvider } = await import('./account/CloudSyncProvider');
    const { useCloudSync } = await import('./account/accountContext');
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
    expect(await screen.findByText(`in:${ME}:settled`)).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});
