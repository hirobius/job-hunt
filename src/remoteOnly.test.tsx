// Apply's Remote only (control-free list, Adrian 2026-11-13): no switch or chip any more; it follows
// the Search profile's work mode, as Review does, and narrows the Apply list, the pager's "n of N"
// and the All jobs sheet. The old `rjb_apply_remote_only` key is left unread. Review's rule: a job
// that says nothing about where it is (no mode, no place) stays; one with a place that is not
// remote drops.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { ToastProvider } from '@hirobius/design-system';

vi.mock('@supabase/supabase-js', async () => {
  const { createFakeSupabase } = await import('./test/fakeSupabase');
  return { createClient: () => createFakeSupabase().client };
});

import { ColorModeProvider } from './ColorMode';
import App from './App';
import { openAllJobs } from './test/allJobs';
import { addJob, getAllJobs, jobIdOf, removeJob, updateJob } from './store';
import {
  getPipelineView,
  resetPipelineView,
  setFollowProfileRemote,
  visibleJobs,
} from './pipelineView';
import { replaceProfiles, saveProfile } from './profile';
import { dismissNotice } from './saveNotice';
import type { Job } from './types';

const A = 'https://acme.example/jobs/1';
const B = 'https://bolt.example/jobs/2';
const C = 'https://cask.example/jobs/3';

const renderApp = () =>
  render(
    <ColorModeProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ColorModeProvider>,
  );

beforeEach(() => {
  setFollowProfileRemote(true);
  localStorage.clear();
  resetPipelineView();
  window.history.replaceState(null, '', '/');
  window.location.hash = '#/apply';
  addJob(A, 'Acme Designer');
  addJob(B, 'Bolt Designer');
  addJob(C, 'Cask Designer');
  updateJob(A, { mode: 'remote' });
  updateJob(B, { mode: 'onsite' });
  // C has no mode but a place: not remote.
  updateJob(C, { location: 'Austin, TX' });
});
afterEach(() => {
  cleanup();
  act(() => dismissNotice());
  getAllJobs()
    .slice()
    .forEach((j) => removeJob(j.url));
  localStorage.clear();
  replaceProfiles([]);
  resetPipelineView();
});

const remoteProfile = () => act(() => void saveProfile({ titles: [], mode: 'remote' }));

describe('visibleJobs with remoteOnly', () => {
  it('keeps remote jobs and ones that say nothing; hybrid, on-site and a place drop', () => {
    const jobs = [
      { url: 'r', mode: 'remote' },
      { url: 'h', mode: 'hybrid' },
      { url: 'o', mode: 'onsite' },
      { url: 'u' },
      { url: 'p', location: 'Austin, TX' },
      { url: 'l', location: 'Remote - US' },
    ].map((j) => ({ label: j.url, status: 'Saved', ...j }) as unknown as Job);
    const urls = (remoteOnly: boolean) =>
      visibleJobs(jobs, { filter: 'all', remoteOnly }).map((j) => j.url);
    expect(urls(true).sort()).toEqual(['l', 'r', 'u']);
    expect(urls(false).sort()).toEqual(['h', 'l', 'o', 'p', 'r', 'u']);
  });
});

describe('Remote only on Apply follows the Search profile', () => {
  it('is on when the profile is remote, off otherwise; the old stored key is not read', () => {
    localStorage.setItem('rjb_apply_remote_only', '1');
    expect(getPipelineView().remoteOnly).toBeFalsy();
    remoteProfile();
    expect(getPipelineView().remoteOnly).toBe(true);
    act(() => void saveProfile({ titles: [], mode: 'any' }));
    expect(getPipelineView().remoteOnly).toBeFalsy();
  });

  it('has no switch or chip, on the job page or in the All jobs sheet', async () => {
    renderApp();
    await screen.findByRole('button', { name: /^View: / });
    expect(screen.queryByRole('switch', { name: 'Remote only' })).toBeNull();
    const sheet = await openAllJobs();
    expect(within(sheet).queryByRole('button', { name: 'Remote only' })).toBeNull();
  });

  it('the pager counts the remote set, and All jobs lists only remote jobs', async () => {
    remoteProfile();
    window.location.hash = `#/apply/${jobIdOf(A)}`;
    renderApp();
    const pager = () => within(screen.getByRole('navigation', { name: 'Jobs in the list' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Acme Designer' })).toBeTruthy();
    expect(pager().getByText('1 of 1')).toBeInTheDocument();
    const sheet = await openAllJobs();
    // Rows are links named by the title alone (#543).
    const titles = within(sheet)
      .getAllByRole('link', { name: /Designer$/ })
      .map((l) => l.textContent);
    expect(titles).toEqual(['Acme Designer']);
  });
});
