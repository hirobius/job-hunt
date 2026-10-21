// Teaching empty states (#132 slice 1): one pattern (title, one sentence, one primary action),
// tested at the route seam through App and driven by title text and the action's role + name.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
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
import { addCategory, addGroup, replaceCurationState } from './curation/curationStore';

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

describe('Discover empties', () => {
  it('no tracks: asks to pick one, and Choose a track opens the setup', async () => {
    addJob('https://acme.example/jobs/1', 'Design Engineer');
    window.location.hash = '#/discover';
    renderApp();
    expect(screen.getByText('Pick a track to search')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Set up your board' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Choose a track' }));
    expect(screen.getByRole('heading', { name: 'Set up your board' })).toBeInTheDocument();
  });

  it('an empty section: no links here yet, with Manage this track', async () => {
    const id = addCategory({
      label: 'Mine',
      titles: ['Welder'],
      atsRoles: [],
      seniority: 'any',
      location: '',
    });
    addGroup(id, { label: 'Shops', sortOrder: 0, archived: false });
    window.location.hash = '#/discover/apply';
    renderApp();
    expect(await screen.findByText('No links here yet')).toBeInTheDocument();
    expect(
      screen.getByText(/Add links you trust, or use ATS search for live ones/),
    ).toBeInTheDocument();
    // The empty state's own action, beside the header's Manage track (#131).
    expect(screen.getAllByRole('button', { name: 'Manage this track' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Manage track' })).toBeInTheDocument();
  });
});

// rev-3 "filtered to nothing": a short title (straight quotes, no period), one sentence, and the
// way back out as the empty's own action.
describe('Pipeline filtered to nothing', () => {
  it('a search with no match: No jobs match "q", a sentence, and Clear search', async () => {
    addJob('https://acme.example/jobs/1', 'Design Engineer');
    window.location.hash = '#/queue';
    renderApp();
    await userEvent.type(screen.getByRole('textbox', { name: 'Search saved jobs' }), 'zzz nothing');
    expect(screen.getByText('No jobs match "zzz nothing"')).toBeInTheDocument();
    expect(screen.getByText('Try a shorter word, or clear the search.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByRole('textbox', { name: 'Search saved jobs' })).toHaveValue('');
    expect(screen.queryByText(/No jobs match/)).toBeNull();
  });

  it('nothing left to apply to: a short title and where to look', async () => {
    setStatusByUrl('https://acme.example/jobs/1', 'Applied', 'Design Engineer');
    window.location.hash = '#/queue';
    renderApp();
    expect(screen.getByText('Nothing left to apply to')).toBeInTheDocument();
    expect(screen.getByText('Check Applied, or add more jobs.')).toBeInTheDocument();
  });
});
