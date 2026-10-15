// Teaching empty states (#132 slice 1): one pattern (title, one sentence, one primary action),
// tested at the route seam through App and driven by title text and the action's role + name.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
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
import { addJob, getAllJobs, removeJob } from './store';
import { addCategory, addGroup, replaceCurationState } from './curation/curationStore';
import { seedPack } from './curation/starterPacks';

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

describe('Today empties', () => {
  it('no jobs: says what Today will hold; Add a job focuses quick-add; sample data is offered', async () => {
    seedPack('consulting');
    window.location.hash = '#/today';
    renderApp();
    expect(screen.getByText('Nothing to do yet')).toBeInTheDocument();
    expect(
      screen.getByText(/Save a job and its follow-ups and interviews show up here/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try with sample data' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add a job' }));
    expect(screen.getByRole('textbox', { name: 'Add a job' })).toHaveFocus();
  });

  it('jobs but nothing due: "You\'re caught up", and Open Pipeline goes to the Pipeline', async () => {
    addJob('https://acme.example/jobs/1', 'Design Engineer');
    window.location.hash = '#/today';
    renderApp();
    expect(screen.getByText("You're caught up")).toBeInTheDocument();
    expect(
      screen.getByText(/Follow-ups fall due 7 days after you apply or last follow up/),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Open Pipeline' }));
    await waitFor(() => expect(window.location.hash).toBe('#/queue'));
  });
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
    window.location.hash = '#/discover';
    renderApp();
    expect(await screen.findByText('No links here yet')).toBeInTheDocument();
    expect(
      screen.getByText(/Add links you trust, or use Title and ATS search for live ones/),
    ).toBeInTheDocument();
    // The empty state's own action, beside the header's Manage track (#131).
    expect(screen.getAllByRole('button', { name: 'Manage this track' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Manage track' })).toBeInTheDocument();
  });
});
