// Apply's "Remote only" filter (Adrian 2026-11-09): a chip in the All jobs sheet on a phone (#543),
// the switch in the lg list column; kept per device, and it narrows the Apply list, the pager's "n of N" and the All jobs sheet. A job
// with no mode counts as not remote.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@hirobius/design-system';

vi.mock('@supabase/supabase-js', async () => {
  const { createFakeSupabase } = await import('./test/fakeSupabase');
  return { createClient: () => createFakeSupabase().client };
});

import { ColorModeProvider } from './ColorMode';
import App from './App';
import { openAllJobs } from './test/allJobs';
import { addJob, getAllJobs, jobIdOf, removeJob, updateJob } from './store';
import { getPipelineView, resetPipelineView, storedRemoteOnly, visibleJobs } from './pipelineView';
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
  localStorage.clear();
  resetPipelineView();
  window.history.replaceState(null, '', '/');
  window.location.hash = '#/apply';
  addJob(A, 'Acme Designer');
  addJob(B, 'Bolt Designer');
  addJob(C, 'Cask Designer');
  updateJob(A, { mode: 'remote' });
  updateJob(B, { mode: 'onsite' });
  // C has no mode: unknown, so not remote.
});
afterEach(() => {
  cleanup();
  act(() => dismissNotice());
  getAllJobs()
    .slice()
    .forEach((j) => removeJob(j.url));
  localStorage.clear();
  resetPipelineView();
});

describe('visibleJobs with remoteOnly', () => {
  it('keeps remote jobs only; hybrid, on-site and unknown drop', () => {
    const jobs = [
      { url: 'r', mode: 'remote' },
      { url: 'h', mode: 'hybrid' },
      { url: 'o', mode: 'onsite' },
      { url: 'u' },
    ].map((j) => ({ label: j.url, status: 'Saved', ...j }) as unknown as Job);
    const urls = (remoteOnly: boolean) =>
      visibleJobs(jobs, { filter: 'all', sort: 'recent', q: '', remoteOnly }).map((j) => j.url);
    expect(urls(true)).toEqual(['r']);
    expect(urls(false).sort()).toEqual(['h', 'o', 'r', 'u']);
  });
});

describe('the Remote only switch on Apply', () => {
  it('is a chip in the All jobs sheet (not on the job page), and is stored per device', async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole('button', { name: /^View: / });
    expect(screen.queryByRole('switch', { name: 'Remote only' })).toBeNull();
    const sheet = await openAllJobs();
    const chip = within(sheet).getByRole('button', { name: 'Remote only' });
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    await user.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect(getPipelineView().remoteOnly).toBe(true);
    expect(storedRemoteOnly()).toBe(true);
    // A fresh view (as on a reload) reads the stored choice back.
    act(() => resetPipelineView());
    expect(getPipelineView().remoteOnly).toBe(true);
    await user.click(within(sheet).getByRole('button', { name: 'Remote only' }));
    expect(storedRemoteOnly()).toBe(false);
  });

  it('the pager counts the filtered set, and All jobs lists only remote jobs', async () => {
    const user = userEvent.setup();
    window.location.hash = `#/apply/${jobIdOf(A)}`;
    renderApp();
    const pager = () => within(screen.getByRole('navigation', { name: 'Jobs in the list' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Acme Designer' })).toBeTruthy();
    expect(pager().getByText(/of 3/)).toBeInTheDocument();
    const sheet = await openAllJobs();
    await user.click(within(sheet).getByRole('button', { name: 'Remote only' }));
    expect(pager().getByText('1 of 1')).toBeInTheDocument();
    // Rows are links named by the title alone (#543).
    const titles = within(sheet)
      .getAllByRole('link', { name: /Designer$/ })
      .map((l) => l.textContent);
    expect(titles).toEqual(['Acme Designer']);
  });
});
