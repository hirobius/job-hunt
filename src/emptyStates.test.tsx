// Teaching empty states (#132 slice 1): one pattern (title, one sentence, one primary action),
// tested at the route seam through App and driven by title text and the action's role + name.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
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

import { createFakeSupabase } from './test/fakeSupabase';
import { ColorModeProvider } from './ColorMode';
import App from './App';
import { addJob, getAllJobs, removeJob, setStatusByUrl } from './store';
import { replaceCurationState } from './curation/curationStore';
import { getAllDocuments } from './documents';
import { getSnippets } from './copyDeckStore';
import { loadSupabase } from './supabase';

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
  replaceCurationState({ categories: [], groups: [], tiles: [] });
  window.history.replaceState(null, '', '/');
  window.location.hash = '';
});
afterEach(() => {
  cleanup();
  getAllJobs()
    .slice()
    .forEach((j) => removeJob(j.url));
  replaceCurationState({ categories: [], groups: [], tiles: [] });
});

// rev-3 "filtered to nothing": a short title (straight quotes, no period), one sentence, and the
// way back out as the empty's own action.
describe('Pipeline filtered to nothing', () => {
  it('a search with no match: No jobs match "q", a sentence, and Clear search', async () => {
    addJob('https://acme.example/jobs/1', 'Design Engineer');
    window.location.hash = '#/apply';
    renderApp();
    // The Apply list is the All jobs sheet on a phone (Proposal A).
    await openAllJobs();
    await userEvent.type(screen.getByRole('textbox', { name: 'Search saved jobs' }), 'zzz nothing');
    expect(screen.getByText('No jobs match "zzz nothing"')).toBeInTheDocument();
    expect(screen.getByText('Try a shorter word, or clear the search.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByRole('textbox', { name: 'Search saved jobs' })).toHaveValue('');
    expect(screen.queryByText(/No jobs match/)).toBeNull();
  });

  it('nothing left to apply to: a short title and where to look', async () => {
    setStatusByUrl('https://acme.example/jobs/1', 'Applied', 'Design Engineer');
    window.location.hash = '#/apply';
    renderApp();
    await openAllJobs();
    expect(screen.getByText('Nothing left to apply to')).toBeInTheDocument();
    expect(screen.getByText('Check Applied, or add more jobs.')).toBeInTheDocument();
  });
});

// Adrian 2026-10-22: a first run shows nothing the user did not create, and empty sections hide.
describe('a clean first run', () => {
  it('Documents: one empty state with Add starter messages; nothing was added behind it', async () => {
    window.location.hash = '#/copy-deck';
    renderApp();
    expect(await screen.findByText('No documents yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add starter messages' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Messages' })).toBeNull();
    expect(getAllDocuments()).toEqual([]);
    expect(getSnippets()).toEqual([]);
  });

  it('the Add job field shows its name, not a made-up link', async () => {
    window.location.hash = '#/apply';
    renderApp();
    await userEvent.click(screen.getAllByRole('button', { name: 'Add job' })[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Add a job' });
    expect(within(dialog).getByRole('textbox', { name: 'Job link' })).toHaveAttribute(
      'placeholder',
      'Job link',
    );
  });

  it('signed in on a new device with an empty account: still no starter messages', async () => {
    await loadSupabase();
    window.location.hash = '#/copy-deck';
    renderApp();
    act(() => h.fake!.signIn('u-new'));
    // The seed merge lands and pushes this device's (empty) blob up.
    await waitFor(() => expect(h.fake!.tables.tracker?.length).toBe(1));
    expect(await screen.findByText('No documents yet')).toBeInTheDocument();
    expect(getAllDocuments()).toEqual([]);
    act(() => void h.fake!.client.auth.signOut());
  });
});
