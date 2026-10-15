// #127: every saved job has its own route, #/queue/<jobId>, rendered through App. Tested at the
// route seam: a job link opens that job, the card links to its page, an unknown id falls back to
// the Pipeline once sync has settled, and quick-add still lands on the Pipeline.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
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
import { ColorModeProvider } from './ColorMode';
import App from './App';
import { addJob, getAllJobs, jobIdOf, removeJob, updateJob } from './store';

const URL_A = 'https://acme.example/jobs/7';

const renderApp = () =>
  render(
    <ColorModeProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ColorModeProvider>,
  );

beforeEach(() => {
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
  it('#/queue/<jobId> opens that job on its own page, with the editor open for a job without a company', async () => {
    addJob(URL_A, 'Design Engineer');
    window.location.hash = `#/queue/${jobIdOf(URL_A)}`;
    renderApp();
    expect(screen.getByRole('heading', { level: 2, name: 'Design Engineer' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('Design Engineer');
    // The shell's own tab list: the job page has its own tabs now.
    expect(
      within(screen.getByRole('tablist', { name: 'Sections' })).getByRole('tab', {
        selected: true,
      }),
    ).toHaveAccessibleName('Pipeline');
  });

  it('a retired job says so on its page, without fading its text', () => {
    addJob(URL_A, 'Design Engineer');
    updateJob(URL_A, { archived: true });
    window.location.hash = `#/queue/${jobIdOf(URL_A)}`;
    const { container: page } = renderApp();
    expect(screen.getByRole('heading', { level: 2, name: 'Design Engineer' })).toBeInTheDocument();
    // The header says Retired next to the status (it replaced the card's "Retired · Saved" eyebrow).
    expect(screen.getByText('Retired')).toBeInTheDocument();
    expect(
      [page, ...page.querySelectorAll<HTMLElement>('*')].some(
        (e) => e.style.opacity !== '' && Number(e.style.opacity) > 0 && Number(e.style.opacity) < 1,
      ),
    ).toBe(false);
  });

  it('Back returns to the Pipeline list', async () => {
    addJob(URL_A, 'Design Engineer');
    window.location.hash = `#/queue/${jobIdOf(URL_A)}`;
    renderApp();
    await userEvent.click(screen.getByRole('button', { name: /Back to Pipeline/ }));
    await waitFor(() => expect(window.location.hash).toBe('#/queue'));
    expect(screen.getByRole('heading', { level: 2, name: 'Pipeline' })).toBeInTheDocument();
  });

  it('a job in the list links to its page', async () => {
    addJob(URL_A, 'Design Engineer');
    window.location.hash = '#/queue';
    renderApp();
    await userEvent.click(screen.getByRole('link', { name: 'Design Engineer' }));
    await waitFor(() => expect(window.location.hash).toBe(`#/queue/${jobIdOf(URL_A)}`));
  });

  it('an unknown job id falls back to the Pipeline once sync has settled', async () => {
    window.location.hash = '#/queue/doesnotexist';
    renderApp();
    await waitFor(() => expect(window.location.hash).toBe('#/queue'));
    expect(screen.getByRole('heading', { level: 2, name: 'Pipeline' })).toBeInTheDocument();
  });

  it('signed in but offline, an unknown id stays put instead of guessing it is gone', async () => {
    h.fake!.failNext('tracker', 'select');
    window.location.hash = '#/queue/notsyncedyet';
    renderApp();
    act(() => h.fake!.signIn('u1'));
    expect(await screen.findByText('Job not found')).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 50));
    expect(window.location.hash).toBe('#/queue/notsyncedyet');
  });

  it('switching tabs drops the job id', async () => {
    addJob(URL_A, 'Design Engineer');
    window.location.hash = `#/queue/${jobIdOf(URL_A)}`;
    renderApp();
    await userEvent.click(screen.getByRole('tab', { name: 'Templates' }));
    await userEvent.click(screen.getByRole('tab', { name: 'Pipeline' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Pipeline' })).toBeInTheDocument();
  });

  it('a ?add= quick-add link still lands on the Pipeline, not a job page', () => {
    window.history.replaceState(null, '', '/?add=https://acme.example/jobs/9');
    renderApp();
    expect(window.location.hash).toBe('#/queue');
  });
});
