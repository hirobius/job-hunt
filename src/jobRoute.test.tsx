// #127: every saved job has its own route, #/apply/<jobId>, rendered through App. Tested at the
// route seam: a job link opens that job, the card links to its page, an unknown id falls back to
// the Pipeline once sync has settled, and quick-add still lands on the Pipeline.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { openAllJobs } from './test/allJobs';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@hirobius/design-system';

const h = vi.hoisted(() => ({ fake: null as null | ReturnType<typeof createFakeSupabase> }));
vi.mock('@supabase/supabase-js', async () => {
  const { createFakeSupabase } = await import('./test/fakeSupabase');
  return {
    createClient: () => {
      h.fake = createFakeSupabase();
      return h.fake.client;
    },
  };
});

import { act } from '@testing-library/react';
import { createFakeSupabase } from './test/fakeSupabase';
import { loadSupabase } from './supabase';
import { ColorModeProvider } from './ColorMode';
import App from './App';
import { addJob, getAllJobs, jobIdOf, removeJob, updateJob } from './store';
import { currentTab, topTab } from './test/topTabs';

const URL_A = 'https://acme.example/jobs/7';
const URL_B = 'https://acme.example/jobs/2';

const renderApp = () =>
  render(
    <ColorModeProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ColorModeProvider>,
  );

// The Supabase client loads lazily (supabase.ts); load it as a sign-in would, so `fake()` exists.
beforeEach(async () => {
  await loadSupabase();
  h.fake?.reset();
  localStorage.clear();
  window.history.replaceState(null, '', '/');
  window.location.hash = '';
});
afterEach(() => {
  cleanup();
  getAllJobs()
    .slice()
    .forEach((j) => removeJob(j.url));
});

describe('job route (#127)', () => {
  it('#/apply/<jobId> opens that job on its own page, with the editor open for a job without a company', async () => {
    addJob(URL_A, 'Design Engineer');
    window.location.hash = `#/apply/${jobIdOf(URL_A)}`;
    renderApp();
    expect(screen.getByRole('heading', { level: 1, name: 'Design Engineer' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('Design Engineer');
    // The shell's own top tabs: Apply is the open one.
    expect(currentTab()).toHaveAccessibleName('Apply');
  });

  it('a retired job says so on its page, without fading its text', () => {
    addJob(URL_A, 'Design Engineer');
    updateJob(URL_A, { archived: true });
    window.location.hash = `#/apply/${jobIdOf(URL_A)}`;
    const { container: page } = renderApp();
    expect(screen.getByRole('heading', { level: 1, name: 'Design Engineer' })).toBeInTheDocument();
    // The header says Retired next to the status (it replaced the card's "Retired · Saved" eyebrow).
    expect(screen.getByText('Retired')).toBeInTheDocument();
    expect(
      [page, ...page.querySelectorAll<HTMLElement>('*')].some(
        (e) => e.style.opacity !== '' && Number(e.style.opacity) > 0 && Number(e.style.opacity) < 1,
      ),
    ).toBe(false);
  });

  it('a job opened from elsewhere has Back; one opened in the tab has none (Proposal A)', async () => {
    addJob(URL_A, 'Design Engineer');
    window.location.hash = `#/apply/${jobIdOf(URL_A)}?from=%2Ffind`;
    renderApp();
    await userEvent.click(await screen.findByRole('button', { name: /Back to Review/ }));
    await waitFor(() => expect(window.location.hash).toBe('#/review'));
    cleanup();
    window.location.hash = `#/apply/${jobIdOf(URL_A)}`;
    renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Design Engineer' });
    expect(screen.queryByRole('button', { name: /^Back to / })).toBeNull();
  });

  it('a job in the list (All jobs) links to its page', async () => {
    addJob(URL_A, 'Design Engineer');
    addJob(URL_B, 'Welder');
    window.location.hash = '#/apply';
    renderApp();
    const sheet = await openAllJobs();
    await userEvent.click(within(sheet).getByRole('link', { name: 'Welder' }));
    await waitFor(() => expect(window.location.hash).toBe(`#/apply/${jobIdOf(URL_B)}`));
  });

  it('an unknown job id falls back to the Pipeline once sync has settled', async () => {
    window.location.hash = '#/apply/doesnotexist';
    renderApp();
    await waitFor(() => expect(window.location.hash).toBe('#/apply'));
    expect(screen.getByRole('heading', { level: 1, name: 'Apply' })).toBeInTheDocument();
  });

  it('signed in but offline, an unknown id stays put instead of guessing it is gone', async () => {
    h.fake!.failNext('tracker', 'select');
    window.location.hash = '#/apply/notsyncedyet';
    renderApp();
    act(() => h.fake!.signIn('u1'));
    // A job that is about to sync in is never called missing: a skeleton, not 'not found'.
    expect(await screen.findByText(/Looking for this job/)).toBeInTheDocument();
    expect(screen.queryByText('Job not found')).toBeNull();
    await new Promise((r) => setTimeout(r, 50));
    expect(window.location.hash).toBe('#/apply/notsyncedyet');
  });

  // Return paths: the Pipeline tab reopens where it was left (the job page); tapping it again, as
  // the open tab, goes to its root, the list.
  it('switching tabs and back reopens the job; the open tab again goes to the list', async () => {
    addJob(URL_A, 'Design Engineer');
    window.location.hash = `#/apply/${jobIdOf(URL_A)}`;
    renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Design Engineer' });
    await userEvent.click(topTab('Review'));
    await waitFor(() => expect(window.location.hash).toBe('#/review'));
    await userEvent.click(topTab('Apply'));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Design Engineer' }),
    ).toBeInTheDocument();
    // The open tab again goes to its root: #/apply, which is the first job (Proposal A).
    await userEvent.click(topTab('Apply'));
    await waitFor(() => expect(window.location.hash).toBe('#/apply'));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Design Engineer' }),
    ).toBeInTheDocument();
  });

  it('a ?add= quick-add link still lands on the Pipeline, not a job page', () => {
    window.history.replaceState(null, '', '/?add=https://acme.example/jobs/9');
    renderApp();
    expect(window.location.hash).toBe('#/apply');
  });
});
