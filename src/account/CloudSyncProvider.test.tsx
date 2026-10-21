import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button, ToastProvider } from '@hirobius/design-system';
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
import CloudSyncProvider from './CloudSyncProvider';
import { useCloudSync } from './accountContext';
import {
  addCategory,
  getCurationState,
  removeCategory,
  replaceCurationState,
  updateCategory,
} from '../curation/curationStore';
import { setCurationSyncedAt } from '../curation/syncStatus';
import { clearAllPending, getPending } from '../curation/pending';
import { categoryToRow } from '../curation/map';
import { addJob, getAllJobs, removeJob } from '../store';
import { OFFLINE_MSG } from '../cloudMessages';
import { saveTarget, readTargets } from '../feed/targets';
import { readDreams, starDream } from '../feed/dreams';
import { saveFilter, readFilters } from '../feed/savedFilters';
import { readEvidence, writeEvidence } from '../radar/evidenceStore';
import { readMode, writeMode } from '../trackModes';
import { emptyBlob, writeBlob } from '../syncBlob';
import { getTrash, replaceTrash, trashJob } from '../trash';
import { createDocument, getAllDocuments, replaceDocuments } from '../documents';
import type { Job } from '../types';
import { loadSample } from '../demo/loadSample';
import { getAllSweeps, setTitleOn } from '../feed/sweepTitles';

const fake = () => h.fake!;
const NOW = '2026-10-01T00:00:00.000Z';

beforeEach(() => {
  fake().reset();
  replaceCurationState({ categories: [], groups: [], tiles: [] });
});
afterEach(() => {
  cleanup();
  replaceTrash([]);
  replaceDocuments([]);
  getAllJobs()
    .slice()
    .forEach((j) => removeJob(j.url));
  vi.restoreAllMocks();
});

describe('CloudSyncProvider sendLink (#44)', () => {
  function SendButton() {
    const { sendLink } = useCloudSync();
    return <Button onClick={() => void sendLink('me@example.com')}>Send</Button>;
  }

  it('asks Supabase to redirect to an allow-listed origin at the root, never the current path', async () => {
    const otp = vi.spyOn(fake().client.auth, 'signInWithOtp');
    history.pushState(null, '', '/deep/path?next=https://evil.example#/queue');
    try {
      render(
        <ToastProvider>
          <CloudSyncProvider>
            <SendButton />
          </CloudSyncProvider>
        </ToastProvider>,
      );
      await userEvent.click(screen.getByRole('button', { name: 'Send' }));
      await waitFor(() => expect(otp).toHaveBeenCalledTimes(1));
      expect(otp).toHaveBeenCalledWith({
        email: 'me@example.com',
        options: { emailRedirectTo: `${location.origin}/` },
      });
    } finally {
      history.pushState(null, '', '/');
    }
  });
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
    expect(within(menu).getByText('Signed in as u1@example.test')).toBeInTheDocument();
    // …and the tracker blob it pushed is v9 (no pillars / userTiles).
    expect(fake().tables.tracker[0].data).toMatchObject({ v: 10 });
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

  // rev-3 O: a sync or save failure offers Reload (also in Account menu, Troubleshooting). Never Reset.
  it('the Sync paused toast offers Reload, and no Reset', async () => {
    fake().failNext('tracker', 'select');
    renderAccount();
    act(() => fake().signIn('u1'));
    const title = await screen.findByText('Sync paused');
    const toast = title.closest('li') ?? title.parentElement!.parentElement!;
    expect(
      within(toast as HTMLElement).getByRole('button', { name: /^Reload/ }),
    ).toBeInTheDocument();
    expect(within(toast as HTMLElement).queryByRole('button', { name: /Reset/ })).toBeNull();
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
    const toast = screen.getByText('Delete incomplete').closest('li')!;
    expect(within(toast).getByRole('button', { name: /^Reload/ })).toBeInTheDocument();
    expect(getAllJobs()).toHaveLength(1);
  });

  it('never pushes the unmerged local copy after a failed pull; a later good pull re-opens pushes (#161)', async () => {
    // Cloud holds a job that only lives there; this device holds a different one.
    addJob('https://cloud.example/jobs/1', 'Cloud only');
    const cloudData = writeBlob({
      ...emptyBlob(),
      jobs: getAllJobs(),
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
    const toast = screen.getByText('Track changes didn’t reach the cloud').closest('li')!;
    expect(within(toast).getByRole('button', { name: /^Reload/ })).toBeInTheDocument();
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

  it('an edit made after another tab signed out is kept and sent at the next sign-in (#169)', async () => {
    const id = await signedInWithSyncedTrack();
    // Another tab signs out: the stored session is gone and this tab hears SIGNED_OUT, but this
    // tab never ran its own sign-out (no wipe, no reload), so its board is still on screen.
    await act(async () => {
      await fake().client.auth.signOut();
    });
    act(() => updateCategory(id, { label: 'Design Engineering' }));
    await waitFor(() =>
      expect(getPending()).toEqual([
        expect.objectContaining({ table: 'categories', id, op: 'upsert', failed: true }),
      ]),
    );
    expect(cloudLabels()).toEqual(['Design Systems']);
    act(() => fake().signIn('u1'));
    await waitFor(() => expect(cloudLabels()).toEqual(['Design Engineering']));
    expect(label()).toEqual(['Design Engineering']);
    expect(getPending()).toEqual([]);
  });

  it('a job removed on another device stays removed when this one reloads (#219)', async () => {
    renderAccount();
    act(() => fake().signIn('u1'));
    act(() => {
      addJob('https://a.example/1');
      addJob('https://b.example/1');
    });
    await waitFor(() => expect(fake().tables.tracker?.[0]?.data.jobs).toHaveLength(2));

    // Another device removes A: the cloud now lists it under Recently removed.
    const data = fake().tables.tracker[0].data;
    const [a, b] = [...data.jobs].sort((x: Job, y: Job) => x.url.localeCompare(y.url));
    fake().tables.tracker[0].data = {
      ...data,
      jobs: [b],
      trash: [{ job: a, removedAt: new Date().toISOString() }],
    };

    // This device reloads with its old copy still in storage and signs in again.
    cleanup();
    renderAccount();
    act(() => fake().signIn('u1'));
    await waitFor(() => expect(getTrash().map((r) => r.job.url)).toEqual([a.url]));
    expect(getAllJobs().map((j) => j.url)).toEqual([b.url]);
    await waitFor(() =>
      expect(fake().tables.tracker[0].data.jobs.map((j: Job) => j.url)).toEqual([b.url]),
    );
  });

  it('a job removed here while the push failed stays removed after a reload (#219)', async () => {
    renderAccount();
    act(() => fake().signIn('u1'));
    act(() => {
      addJob('https://a.example/1');
      addJob('https://b.example/1');
    });
    await waitFor(() => expect(fake().tables.tracker?.[0]?.data.jobs).toHaveLength(2));
    const a = getAllJobs().find((j) => j.url.startsWith('https://a.'))!.url;

    // Offline: the removal never reaches the cloud, which still lists A.
    fake().failNext('tracker', 'upsert');
    act(() => trashJob(a));
    await act(() => new Promise((r) => setTimeout(r, 700))); // past the push debounce
    expect(fake().tables.tracker[0].data.jobs).toHaveLength(2);

    cleanup();
    renderAccount();
    act(() => fake().signIn('u1'));
    await waitFor(() =>
      expect(fake().tables.tracker[0].data.jobs.map((j: Job) => j.url)).not.toContain(a),
    );
    expect(getAllJobs().map((j) => j.url)).not.toContain(a);
    expect(getTrash().map((r) => r.job.url)).toEqual([a]);
  });

  it('sample data is kept on this device across reloads while signed in, and never uploaded', async () => {
    renderAccount();
    act(() => fake().signIn('u1'));
    await waitFor(() => expect(fake().tables.tracker?.length).toBe(1));
    act(() => {
      loadSample();
      addJob('https://real.example/1');
    });
    const sample = getAllJobs().filter((j) => (j as { demo?: boolean }).demo).length;
    expect(sample).toBeGreaterThan(0);
    await waitFor(() => expect(fake().tables.tracker[0].data.jobs).toHaveLength(1));

    cleanup();
    renderAccount();
    act(() => fake().signIn('u1'));
    await waitFor(() => expect(fake().tables.tracker[0].data.jobs).toHaveLength(1));
    expect(getAllJobs().filter((j) => (j as { demo?: boolean }).demo)).toHaveLength(sample);
    expect(getAllJobs().map((j) => j.url)).toContain('https://real.example/1');
  });

  // ADR 0008: what the user edits (targets, saved searches, evidence, work mode) follows the account.
  describe('user-edited stores follow the account', () => {
    beforeEach(() => {
      localStorage.clear();
      // The edits below belong to track 'trk', which must exist or they are pruned as orphans.
      replaceCurationState({
        categories: [
          {
            id: 'trk',
            label: 'Design Systems',
            titles: [],
            atsRoles: [],
            seniority: 'any',
            location: '',
            tailorRole: null,
            sortOrder: 0,
            archived: false,
            createdAt: NOW,
            updatedAt: NOW,
          },
        ],
        groups: [],
        tiles: [],
      });
    });
    const target = {
      login: 'acme',
      company: 'Acme',
      repo: 'acme/ds',
      repoUrl: 'https://github.com/acme/ds',
      stars: 3,
    };
    const search = {
      name: 'Austin hybrid',
      term: 'design systems',
      where: 'Austin, TX',
      mode: 'hybrid' as const,
      exclude: ['manager'],
      seniority: 'any' as const,
      salaryOnly: false,
      contractOnly: false,
    };
    const edit = () => {
      saveTarget('trk', target);
      saveFilter('trk', search);
      writeEvidence('Led a design system');
      writeMode('trk', 'hybrid');
      starDream('trk', { company: 'Dreamco' });
      createDocument({ kind: 'resume', title: 'Base résumé', base: true, text: 'cv' });
    };

    it('survives sign-out and comes back on a fresh device', async () => {
      renderAccount();
      act(() => fake().signIn('u1'));
      await waitFor(() => expect(fake().tables.tracker?.length).toBe(1));
      act(edit);
      await waitFor(() =>
        expect(fake().tables.tracker[0].data).toMatchObject({
          v: 10,
          targets: { trk: [{ login: 'acme' }] },
          filters: { trk: [{ name: 'Austin hybrid' }] },
          evidence: 'Led a design system',
          modes: { trk: 'hybrid' },
          dreams: { trk: [{ company: 'Dreamco' }] },
          documents: [{ title: 'Base résumé', base: true }],
        }),
      );

      // Sign out wipes this browser…
      await chooseAccountItem('Sign out');
      await waitFor(() => expect(readTargets('trk')).toEqual([]));
      expect(readFilters('trk')).toEqual([]);
      expect(readEvidence()).toBe('');
      expect(readMode('trk')).toBe('any');
      expect(readDreams('trk')).toEqual([]);

      // …and a fresh device signing in gets it all back.
      cleanup();
      localStorage.clear();
      act(() => replaceDocuments([])); // a fresh device's in-memory store
      renderAccount();
      act(() => fake().signIn('u1'));
      await waitFor(() => expect(readTargets('trk').map((t) => t.login)).toEqual(['acme']));
      expect(readFilters('trk').map((f) => f.name)).toEqual(['Austin hybrid']);
      expect(readEvidence()).toBe('Led a design system');
      expect(readMode('trk')).toBe('hybrid');
      expect(readDreams('trk').map((d) => d.company)).toEqual(['Dreamco']);
      expect(getAllDocuments().map((d) => d.title)).toEqual(['Base résumé']);
    });

    it('the title filter (#223) follows the account to another device', async () => {
      const seed = ['Design Systems Engineer', 'Design Engineer', 'UX Engineer'];
      renderAccount();
      act(() => fake().signIn('u1'));
      await waitFor(() => expect(fake().tables.tracker?.length).toBe(1));
      act(() => {
        setTitleOn('trk', seed, 'UX Engineer', false);
      });
      await waitFor(() =>
        expect(fake().tables.tracker[0].data.sweeps).toEqual({
          trk: { titles: seed, off: ['UX Engineer'] },
        }),
      );

      // Sign out wipes this browser; a fresh device signing in gets the same ticks back.
      await chooseAccountItem('Sign out');
      await waitFor(() => expect(getAllSweeps()).toEqual({}));
      cleanup();
      localStorage.clear();
      act(() => replaceDocuments([]));
      renderAccount();
      act(() => fake().signIn('u1'));
      await waitFor(() =>
        expect(getAllSweeps()).toEqual({ trk: { titles: seed, off: ['UX Engineer'] } }),
      );
    });

    it('first sign-in keeps this device’s entries and unions them with the cloud’s', async () => {
      fake().tables.tracker = [
        {
          user_id: 'u1',
          updated_at: NOW,
          data: {
            v: 5,
            jobs: [],
            copydeck: [],
            triage: { dismissed: [] },
            targets: { trk: [{ ...target, login: 'cloudco', repo: 'cloudco/ds', savedAt: NOW }] },
            filters: {},
            evidence: 'cloud evidence',
            modes: {},
          },
        },
      ];
      edit(); // this device was used signed out
      renderAccount();
      act(() => fake().signIn('u1'));
      await waitFor(() =>
        expect(
          readTargets('trk')
            .map((t) => t.login)
            .sort(),
        ).toEqual(['acme', 'cloudco']),
      );
      expect(readFilters('trk')).toHaveLength(1);
      expect(readEvidence()).toBe(
        'cloud evidence\n\n--- From this device ---\n\nLed a design system',
      ); // both kept when they differ
      expect(readMode('trk')).toBe('hybrid');
      await waitFor(() => expect(fake().tables.tracker[0].data.targets.trk).toHaveLength(2));
    });

    it('first sign-in says so when combining evidence from two devices passes the cap', async () => {
      fake().tables.tracker = [
        {
          user_id: 'u1',
          updated_at: NOW,
          data: {
            v: 5,
            jobs: [],
            copydeck: [],
            triage: { dismissed: [] },
            evidence: 'c'.repeat(15_000),
          },
        },
      ];
      writeEvidence('l'.repeat(10_000));
      renderAccount();
      act(() => fake().signIn('u1'));
      expect(await screen.findByText('Evidence was trimmed')).toBeInTheDocument();
      expect(readEvidence().length).toBe(20_000);
    });

    it('an old-deploy tab that strips the v5 fields gets them re-uploaded on the next refresh', async () => {
      renderAccount();
      act(() => fake().signIn('u1'));
      await waitFor(() => expect(fake().tables.tracker?.length).toBe(1));
      act(edit);
      await waitFor(() => expect(fake().tables.tracker[0].data.targets?.trk).toHaveLength(1));
      // An old client rewrites the row without the new fields.
      fake().tables.tracker[0].data = { v: 4, jobs: [], copydeck: [], triage: { dismissed: [] } };
      act(() => {
        window.dispatchEvent(new Event('focus'));
      });
      await waitFor(() => expect(fake().tables.tracker[0].data.targets?.trk).toHaveLength(1));
      expect(fake().tables.tracker[0].data).toMatchObject({
        v: 10,
        evidence: 'Led a design system',
        modes: { trk: 'hybrid' },
      });
    });

    it('a v7 blob from the production deploy never wipes Recently removed, and gets it re-uploaded', async () => {
      renderAccount();
      act(() => fake().signIn('u1'));
      await waitFor(() => expect(fake().tables.tracker?.length).toBe(1));
      act(() => {
        addJob('https://example.test/removed', 'Removed job');
        trashJob('https://example.test/removed');
      });
      await waitFor(() => expect(fake().tables.tracker[0].data.trash).toHaveLength(1));
      // A tab on the v7 deploy (kit and sweeps, no trash) rewrites the row.
      fake().tables.tracker[0].data = {
        v: 7,
        jobs: [],
        copydeck: [],
        triage: { dismissed: [] },
        kit: { fields: {}, answers: [] },
        sweeps: {},
      };
      act(() => {
        window.dispatchEvent(new Event('focus'));
      });
      await waitFor(() => expect(fake().tables.tracker[0].data).toMatchObject({ v: 10 }));
      expect(fake().tables.tracker[0].data.trash).toHaveLength(1);
      expect(getTrash().map((r) => r.job.url)).toEqual(['https://example.test/removed']);
    });

    it('a reload after an old-deploy tab rewrote the row keeps the fields that tab did not know (#219 review)', async () => {
      renderAccount();
      act(() => fake().signIn('u1'));
      await waitFor(() => expect(fake().tables.tracker?.length).toBe(1));
      act(edit);
      await waitFor(() => expect(fake().tables.tracker[0].data.documents).toHaveLength(1));
      // A tab on the v8 deploy (no dream companies, no Documents) rewrites the row.
      const { dreams: _d, documents: _docs, ...v8 } = fake().tables.tracker[0].data;
      fake().tables.tracker[0].data = { ...v8, v: 8 };

      // This device reloads: its sync base knows the dream company and the document, but a v8
      // copy says nothing about them, so they are kept and re-uploaded.
      cleanup();
      renderAccount();
      act(() => fake().signIn('u1'));
      await waitFor(() => expect(fake().tables.tracker[0].data).toMatchObject({ v: 10 }));
      expect(readDreams('trk').map((d) => d.company)).toEqual(['Dreamco']);
      expect(getAllDocuments().map((d) => d.title)).toEqual(['Base résumé']);
      expect(fake().tables.tracker[0].data.documents).toHaveLength(1);
    });

    it('sign-out inside the push debounce still uploads the edit before wiping', async () => {
      renderAccount();
      act(() => fake().signIn('u1'));
      await waitFor(() => expect(fake().tables.tracker?.length).toBe(1));
      act(edit);
      await chooseAccountItem('Sign out'); // well inside the 500 ms debounce
      await waitFor(() => expect(readTargets('trk')).toEqual([]));
      expect(fake().tables.tracker[0].data).toMatchObject({
        targets: { trk: [{ login: 'acme' }] },
        evidence: 'Led a design system',
        modes: { trk: 'hybrid' },
      });
    });

    it('a failed push at sign-out asks before wiping; cancel keeps everything', async () => {
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
      renderAccount();
      act(() => fake().signIn('u1'));
      await waitFor(() => expect(fake().tables.tracker?.length).toBe(1));
      fake().failNext('tracker', 'upsert');
      act(edit);
      await chooseAccountItem('Sign out');
      await waitFor(() =>
        expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/latest changes/)),
      );
      expect(readTargets('trk')).toHaveLength(1);
      expect(readEvidence()).toBe('Led a design system');
    });

    it('a failed push is retried (the edit is still dirty), so a later sign-out uploads it', async () => {
      renderAccount();
      act(() => fake().signIn('u1'));
      await waitFor(() => expect(fake().tables.tracker?.length).toBe(1));
      fake().failNext('tracker', 'upsert');
      act(edit);
      await screen.findByText(OFFLINE_MSG);
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      await chooseAccountItem('Sign out');
      await waitFor(() => expect(readTargets('trk')).toEqual([]));
      expect(fake().tables.tracker[0].data.targets?.trk).toHaveLength(1);
    });

    it('a track whose upload is still pending never loses its data to another device’s sync', async () => {
      // Device A: the track write is refused while the blob push (with its target) succeeds.
      renderAccount();
      act(() => fake().signIn('u1'));
      await waitFor(() => expect(fake().tables.tracker?.length).toBe(1));
      const release = fake().holdNext('categories', 'upsert');
      let id = '';
      act(() => {
        id = addCategory({ label: 'Pending track' });
      });
      act(() => {
        saveTarget(id, target);
      });
      await waitFor(() => expect(fake().tables.tracker[0].data.targets?.[id]).toHaveLength(1));
      expect((fake().tables.categories ?? []).some((r) => r.id === id)).toBe(false);

      // Device B (fresh) signs in and syncs: it cannot see the track, but must not prune its data.
      cleanup();
      localStorage.clear();
      replaceCurationState({ categories: [], groups: [], tiles: [] });
      renderAccount();
      act(() => fake().signIn('u1'));
      await waitFor(() => expect(readTargets(id)).toHaveLength(1));
      await new Promise((r) => setTimeout(r, 100));
      expect(fake().tables.tracker[0].data.targets?.[id]).toHaveLength(1);
      act(() => {
        window.dispatchEvent(new Event('focus'));
      });
      await new Promise((r) => setTimeout(r, 100));
      expect(fake().tables.tracker[0].data.targets?.[id]).toHaveLength(1);
      expect(readTargets(id)).toHaveLength(1);
      release();
    });

    it('an old-deploy tab that strips the v5 fields gets them re-uploaded on the next refresh', async () => {
      renderAccount();
      act(() => fake().signIn('u1'));
      await waitFor(() => expect(fake().tables.tracker?.length).toBe(1));
      act(edit);
      await waitFor(() => expect(fake().tables.tracker[0].data.targets?.trk).toHaveLength(1));
      // An old client rewrites the row without the new fields.
      fake().tables.tracker[0].data = { v: 4, jobs: [], copydeck: [], triage: { dismissed: [] } };
      act(() => {
        window.dispatchEvent(new Event('focus'));
      });
      await waitFor(() => expect(fake().tables.tracker[0].data.targets?.trk).toHaveLength(1));
      expect(fake().tables.tracker[0].data).toMatchObject({
        v: 10,
        evidence: 'Led a design system',
        modes: { trk: 'hybrid' },
      });
    });

    it('sign-out inside the push debounce still uploads the edit before wiping', async () => {
      renderAccount();
      act(() => fake().signIn('u1'));
      await waitFor(() => expect(fake().tables.tracker?.length).toBe(1));
      act(edit);
      await chooseAccountItem('Sign out'); // well inside the 500 ms debounce
      await waitFor(() => expect(readTargets('trk')).toEqual([]));
      expect(fake().tables.tracker[0].data).toMatchObject({
        targets: { trk: [{ login: 'acme' }] },
        evidence: 'Led a design system',
        modes: { trk: 'hybrid' },
      });
    });

    it('a failed push at sign-out asks before wiping; cancel keeps everything', async () => {
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
      renderAccount();
      act(() => fake().signIn('u1'));
      await waitFor(() => expect(fake().tables.tracker?.length).toBe(1));
      fake().failNext('tracker', 'upsert');
      act(edit);
      await chooseAccountItem('Sign out');
      await waitFor(() =>
        expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/latest changes/)),
      );
      expect(readTargets('trk')).toHaveLength(1);
      expect(readEvidence()).toBe('Led a design system');
    });

    it('a failed push is retried (the edit is still dirty), so a later sign-out uploads it', async () => {
      renderAccount();
      act(() => fake().signIn('u1'));
      await waitFor(() => expect(fake().tables.tracker?.length).toBe(1));
      fake().failNext('tracker', 'upsert');
      act(edit);
      await screen.findByText(OFFLINE_MSG);
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      await chooseAccountItem('Sign out');
      await waitFor(() => expect(readTargets('trk')).toEqual([]));
      expect(fake().tables.tracker[0].data.targets?.trk).toHaveLength(1);
    });

    it('a v4 cloud blob (no new fields) never wipes this device on sign-in or refresh', async () => {
      fake().tables.tracker = [
        {
          user_id: 'u1',
          updated_at: NOW,
          data: { v: 4, jobs: [], copydeck: [], triage: { dismissed: [] } },
        },
      ];
      edit();
      renderAccount();
      act(() => fake().signIn('u1'));
      await waitFor(() => expect(fake().tables.tracker[0].data.v).toBe(10));
      act(() => {
        window.dispatchEvent(new Event('focus'));
      });
      await new Promise((r) => setTimeout(r, 50));
      expect(readTargets('trk')).toHaveLength(1);
      expect(readEvidence()).toBe('Led a design system');
    });
  });
});
