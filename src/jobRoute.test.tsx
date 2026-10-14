// #127: every saved job has its own route, #/queue/<jobId>, rendered through App. Tested at the
// route seam: a job link opens that job, the card links to its page, an unknown id falls back to
// the Pipeline once sync has settled, and quick-add still lands on the Pipeline.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@hirobius/design-system';

vi.mock('@supabase/supabase-js', async () => {
  const { createFakeSupabase } = await import('./test/fakeSupabase');
  return { createClient: () => createFakeSupabase().client };
});

import { ColorModeProvider } from './ColorMode';
import App from './App';
import { addJob, getAllJobs, jobIdOf, removeJob } from './store';

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
  it('#/queue/<jobId> opens that job on its own page with its details open', async () => {
    addJob(URL_A, 'Design Engineer');
    window.location.hash = `#/queue/${jobIdOf(URL_A)}`;
    renderApp();
    expect(screen.getByRole('heading', { level: 2, name: 'Design Engineer' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('Design Engineer');
    expect(screen.getByRole('tab', { selected: true })).toHaveAccessibleName('Pipeline');
  });

  it('Back returns to the Pipeline list', async () => {
    addJob(URL_A, 'Design Engineer');
    window.location.hash = `#/queue/${jobIdOf(URL_A)}`;
    renderApp();
    await userEvent.click(screen.getByRole('button', { name: /Back to Pipeline/ }));
    await waitFor(() => expect(window.location.hash).toBe('#/queue'));
    expect(screen.getByRole('heading', { level: 2, name: 'Pipeline' })).toBeInTheDocument();
  });

  it('a card links to its job page', async () => {
    addJob(URL_A, 'Design Engineer');
    window.location.hash = '#/queue';
    renderApp();
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    await userEvent.click(
      within(await screen.findByRole('menu')).getByRole('menuitem', { name: 'Open job page' }),
    );
    await waitFor(() => expect(window.location.hash).toBe(`#/queue/${jobIdOf(URL_A)}`));
  });

  it('an unknown job id falls back to the Pipeline once sync has settled', async () => {
    window.location.hash = '#/queue/doesnotexist';
    renderApp();
    await waitFor(() => expect(window.location.hash).toBe('#/queue'));
    expect(screen.getByRole('heading', { level: 2, name: 'Pipeline' })).toBeInTheDocument();
  });

  it('a ?add= quick-add link still lands on the Pipeline, not a job page', () => {
    window.history.replaceState(null, '', '/?add=https://acme.example/jobs/9');
    renderApp();
    expect(window.location.hash).toBe('#/queue');
  });
});
