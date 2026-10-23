// Data-safety audit (2026-10-23): three ways an edit was lost between devices or across a reload.
//   1. A push overwrote the cloud without looking: another device's newer save was wiped.
//   2. The sign-in merge on load let the cloud win: an edit not yet pushed was reverted.
//   3. A focus re-pull replaced the stores: an edit made while it was in flight was lost.
// Two devices share one fake Supabase; "the other device" writes the cloud row as its push would.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, waitFor } from '@testing-library/react';
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

import { renderAccount, addDeviceDataIfAsked } from '../test/renderAccount';
import { replaceCurationState } from '../curation/curationStore';
import { addJob, getAllJobs, removeJob, updateJob } from '../store';
import { getApplyKit, replaceApplyKit, setKitField } from '../applyKit';
import { emptyKit } from '../applyKit';
import { getAllMustInclude, replaceMustInclude } from '../feed/mustInclude';
import type { Job } from '../types';

const fake = () => h.fake!;
const cloudJobs = (): Job[] => fake().tables.tracker?.[0]?.data.jobs ?? [];
const notesOf = (jobs: Job[], url: string) => jobs.find((j) => j.url === url)?.notes;
const later = () => new Date(Date.now() + 60_000).toISOString();

beforeEach(async () => {
  await loadSupabase();
  fake().reset();
  replaceCurationState({ categories: [], groups: [], tiles: [] });
});
afterEach(() => {
  cleanup();
  replaceApplyKit(emptyKit());
  replaceMustInclude({});
  getAllJobs()
    .slice()
    .forEach((j) => removeJob(j.url));
  vi.restoreAllMocks();
});

async function signedInWith(urls: string[]) {
  renderAccount();
  act(() => fake().signIn('u1'));
  await addDeviceDataIfAsked();
  act(() => urls.forEach((u) => addJob(u)));
  await waitFor(() => expect(cloudJobs()).toHaveLength(urls.length));
  return getAllJobs().map((j) => j.url);
}

/** The other device saves: the cloud row it writes, with its own newer stamp. */
function otherDeviceSaves(edit: (jobs: Job[]) => Job[]) {
  const row = fake().tables.tracker[0];
  fake().tables.tracker[0] = {
    ...row,
    data: { ...row.data, jobs: edit(structuredClone(row.data.jobs)) },
    updated_at: later(),
  };
}

describe('sync safety: no blind push (1)', () => {
  it("an edit on this device never wipes a job the other device saved since this one's last read", async () => {
    await signedInWith(['https://a.example/1']);
    const phone: Job = { ...cloudJobs()[0], url: 'https://phone.example/1', notes: 'from phone' };
    otherDeviceSaves((jobs) => [...jobs, phone]);

    // The desktop stays focused (no re-pull) and edits: its push must not overwrite the phone's.
    act(() => {
      addJob('https://desk.example/1');
    });
    await waitFor(() =>
      expect(cloudJobs().map((j) => j.url)).toEqual(
        expect.arrayContaining(['https://phone.example/1', 'https://desk.example/1']),
      ),
    );
    expect(cloudJobs().map((j) => j.url)).toContain('https://a.example/1');
    // …and this device now has the phone's job too.
    await waitFor(() =>
      expect(getAllJobs().map((j) => j.url)).toContain('https://phone.example/1'),
    );
  });

  it("an edit to the same job on both devices keeps the other device's untouched jobs and this edit", async () => {
    const [a, b] = await signedInWith(['https://a.example/1', 'https://b.example/1']);
    otherDeviceSaves((jobs) => jobs.map((j) => (j.url === b ? { ...j, notes: 'phone note' } : j)));
    act(() => updateJob(a, { notes: 'desk note' }));
    await waitFor(() => expect(notesOf(cloudJobs(), a)).toBe('desk note'));
    expect(notesOf(cloudJobs(), b)).toBe('phone note');
    expect(notesOf(getAllJobs(), b)).toBe('phone note');
  });
});

describe('sync safety: an unpushed edit survives a reload (2)', () => {
  it("a job's notes edited while offline are kept, and pushed, when the page reloads", async () => {
    const [a] = await signedInWith(['https://a.example/1']);
    fake().failNext('tracker', 'upsert'); // offline: the push of the edit fails
    act(() => updateJob(a, { notes: 'edited offline' }));
    await act(() => new Promise((r) => setTimeout(r, 700))); // past the push debounce
    expect(notesOf(cloudJobs(), a)).toBeUndefined();

    cleanup(); // reload with the edit still only in this device's storage
    renderAccount();
    act(() => fake().signIn('u1'));
    await addDeviceDataIfAsked();
    await waitFor(() => expect(notesOf(cloudJobs(), a)).toBe('edited offline'));
    expect(notesOf(getAllJobs(), a)).toBe('edited offline');
  });

  it('an Application kit field edited while offline is kept when the page reloads', async () => {
    await signedInWith(['https://a.example/1']);
    act(() => setKitField('name', 'Sam'));
    await waitFor(() => expect(fake().tables.tracker[0].data.kit.fields.name).toBe('Sam'));
    fake().failNext('tracker', 'upsert');
    act(() => setKitField('name', 'Sam Lee'));
    await act(() => new Promise((r) => setTimeout(r, 700)));

    cleanup();
    renderAccount();
    act(() => fake().signIn('u1'));
    await addDeviceDataIfAsked();
    await waitFor(() => expect(fake().tables.tracker[0].data.kit.fields.name).toBe('Sam Lee'));
    expect(getApplyKit().fields.name).toBe('Sam Lee');
  });

  it("a change the other device made while this one was offline still wins where this one didn't edit", async () => {
    const [a, b] = await signedInWith(['https://a.example/1', 'https://b.example/1']);
    fake().failNext('tracker', 'upsert');
    act(() => updateJob(a, { notes: 'desk, offline' }));
    await act(() => new Promise((r) => setTimeout(r, 700)));
    otherDeviceSaves((jobs) => jobs.map((j) => (j.url === b ? { ...j, notes: 'phone' } : j)));

    cleanup();
    renderAccount();
    act(() => fake().signIn('u1'));
    await addDeviceDataIfAsked();
    await waitFor(() => expect(notesOf(cloudJobs(), a)).toBe('desk, offline'));
    expect(notesOf(cloudJobs(), b)).toBe('phone');
    expect(notesOf(getAllJobs(), b)).toBe('phone');
  });

  it('a job the other device removed stays removed even though this device edited another one', async () => {
    const [a, b] = await signedInWith(['https://a.example/1', 'https://b.example/1']);
    fake().failNext('tracker', 'upsert');
    act(() => updateJob(a, { notes: 'kept' }));
    await act(() => new Promise((r) => setTimeout(r, 700)));
    otherDeviceSaves((jobs) => jobs.filter((j) => j.url !== b));

    cleanup();
    renderAccount();
    act(() => fake().signIn('u1'));
    await addDeviceDataIfAsked();
    await waitFor(() => expect(notesOf(cloudJobs(), a)).toBe('kept'));
    expect(cloudJobs().map((j) => j.url)).toEqual([a]);
    expect(getAllJobs().map((j) => j.url)).toEqual([a]);
  });
});

describe("sync safety: a pull that predates this tab's own push", () => {
  it('an edit pushed while a re-pull was out is not reverted by that older copy', async () => {
    const [a] = await signedInWith(['https://a.example/1']);
    // The server answers the re-pull from before the push below lands; the answer arrives after.
    const release = fake().holdNext('tracker', 'select', { early: true });
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() => expect(fake().holding('tracker', 'select')).toBe(false)); // it is out
    act(() => updateJob(a, { notes: 'pushed during the pull' }));
    await waitFor(() => expect(notesOf(cloudJobs(), a)).toBe('pushed during the pull'));
    await act(async () => release());
    await act(() => new Promise((r) => setTimeout(r, 50)));
    expect(notesOf(getAllJobs(), a)).toBe('pushed during the pull');
    act(() => addJob('https://b.example/1')); // the next push still lands
    await waitFor(() => expect(cloudJobs()).toHaveLength(2));
    expect(notesOf(cloudJobs(), a)).toBe('pushed during the pull');
  });
});

describe('sync safety: an edit during a focus re-pull is kept (3)', () => {
  it('an edit made while the re-pull is in flight is not replaced by the cloud copy', async () => {
    const [a] = await signedInWith(['https://a.example/1']);
    const release = fake().holdNext('tracker', 'select');
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    await act(() => new Promise((r) => setTimeout(r, 20))); // the pull is out
    act(() => updateJob(a, { notes: 'typed during the pull' }));
    await act(async () => release());
    await act(() => new Promise((r) => setTimeout(r, 50)));
    expect(notesOf(getAllJobs(), a)).toBe('typed during the pull');
    await waitFor(() => expect(notesOf(cloudJobs(), a)).toBe('typed during the pull'));
    expect(notesOf(getAllJobs(), a)).toBe('typed during the pull');
  });
});

describe('sync safety: must include (blob v11) rides every pull', () => {
  it("the other device's must include is adopted on a re-pull and survives this device's next push", async () => {
    const [a] = await signedInWith(['https://a.example/1']);
    const rule = { terms: ['systems'], atsOff: [] };
    const row = fake().tables.tracker[0];
    fake().tables.tracker[0] = {
      ...row,
      data: { ...row.data, mustInclude: { t1: rule } },
      updated_at: later(),
    };
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() => expect(getAllMustInclude()).toEqual({ t1: rule }));
    act(() => updateJob(a, { notes: 'after the pull' }));
    await waitFor(() => expect(notesOf(cloudJobs(), a)).toBe('after the pull'));
    expect(fake().tables.tracker[0].data.mustInclude).toEqual({ t1: rule });
  });
});
