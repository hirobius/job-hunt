// Phase 2b of the redesign (#128): Today is home. Tested at the route seam through App and driven
// by role + name: the empty hash lands on Today, which lists due follow-ups and the next week's
// interviews from the sample pipeline, has one quick-add field and the Insights band; the
// Pipeline keeps the list only; the shell owns the first-run gate; existing users get a one-time
// "Today is home" notice.
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

import { createFakeSupabase } from './test/fakeSupabase';
import { ColorModeProvider } from './ColorMode';
import App from './App';
import { addJob, getAllJobs, jobIdOf, removeJob } from './store';
import { loadSample } from './demo/loadSample';
import { replaceCurationState } from './curation/curationStore';
import { seedPack } from './curation/starterPacks';

const renderApp = () =>
  render(
    <ColorModeProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ColorModeProvider>,
  );

const region = (name: RegExp) => screen.getByRole('region', { name });

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

describe('Today is home (#128)', () => {
  it('an empty hash lands on Today', async () => {
    seedPack('consulting');
    renderApp();
    expect(screen.getByRole('tab', { selected: true })).toHaveAccessibleName('Today');
    await waitFor(() => expect(window.location.hash).toBe('#/today'));
    expect(screen.getByRole('heading', { level: 2, name: 'Today' })).toBeInTheDocument();
  });

  it('a ?add= quick-add link still lands on the Pipeline, not on Today', () => {
    window.history.replaceState(null, '', '/?add=https://acme.example/jobs/9');
    renderApp();
    expect(window.location.hash).toBe('#/queue');
    expect(screen.getByRole('tab', { selected: true })).toHaveAccessibleName('Pipeline');
  });
});

describe('Today view (#128)', () => {
  beforeEach(() => {
    loadSample();
    window.location.hash = '#/today';
  });

  it('lists the follow-ups due in the sample pipeline, and only those', () => {
    renderApp();
    const due = region(/^Follow-ups due/);
    const rows = within(due).getAllByRole('listitem');
    expect(rows.map((r) => within(r).getByRole('link').textContent)).toEqual([
      'UX Researcher',
      'Design Systems Lead',
    ]);
    // Each row opens its job and carries one action.
    expect(within(rows[0]).getByRole('link')).toHaveAttribute(
      'href',
      `#/queue/${jobIdOf('https://brambleandfinch.example.com/jobs/ux-researcher')}`,
    );
    expect(within(rows[0]).getAllByRole('button')).toHaveLength(1);
  });

  it('Log follow-up clears the row and confirms with a toast', async () => {
    renderApp();
    await userEvent.click(screen.getByRole('button', { name: 'Log follow-up: UX Researcher' }));
    expect(await screen.findByText('Follow-up logged')).toBeInTheDocument();
    const names = within(region(/^Follow-ups due/))
      .getAllByRole('link')
      .map((l) => l.textContent);
    expect(names).toEqual(['Design Systems Lead']);
  });

  it('lists the interviews and calls coming up in the next 7 days; Open job goes to its page', async () => {
    renderApp();
    const next = region(/^Next 7 days/);
    const rows = within(next).getAllByRole('listitem');
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringMatching(/Interview · Clinical Systems Analyst.*Hiring manager/),
      expect.stringMatching(/Interview · Senior UX Designer.*Final loop/),
    ]);
    await userEvent.click(
      within(rows[0]).getByRole('link', { name: 'Open job: Clinical Systems Analyst' }),
    );
    await waitFor(() =>
      expect(window.location.hash).toBe(
        `#/queue/${jobIdOf('https://meridianoak.example.com/careers/clinical-systems-analyst')}`,
      ),
    );
  });

  it('one quick-add field saves a pasted link and stays on Today', async () => {
    renderApp();
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Add a job' }),
      'https://acme.example/jobs/42',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(getAllJobs().map((j) => j.url)).toContain('https://acme.example/jobs/42');
    expect(await screen.findByText('Saved to your Pipeline')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Add a job' })).toHaveValue('');
    expect(window.location.hash).toBe('#/today');
  });

  it('quick-add says when the job is already saved', async () => {
    renderApp();
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Add a job' }),
      'https://larkspur.example.com/careers/senior-product-designer',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('Already in your Pipeline')).toBeInTheDocument();
  });

  it('Insights: metric tiles and a stage funnel in one band, open state kept per device', async () => {
    const { unmount } = renderApp();
    const toggle = screen.getByRole('button', { name: /^Insights/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Applied, last 7 days')).toBeInTheDocument();
    expect(screen.getByText('Response rate')).toBeInTheDocument();
    // The funnel: every stage as a progress row out of all saved jobs.
    for (const stage of ['Saved', 'Applied', 'Interviewed', 'Offer'])
      expect(screen.getByRole('progressbar', { name: new RegExp(`^${stage}: \\d+ of 10`) }));
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(localStorage.getItem('rjb_ui_insights_open')).toBe('0');
    unmount();
    renderApp();
    expect(screen.getByRole('button', { name: /^Insights/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('the Pipeline holds the list only: no This week, stats or funnel', () => {
    window.location.hash = '#/queue';
    renderApp();
    expect(screen.queryByRole('button', { name: /^Insights/ })).toBeNull();
    expect(screen.queryByText(/^This week/)).toBeNull();
    expect(screen.queryByText('Response rate')).toBeNull();
  });
});

describe('Today with nothing due', () => {
  it('says so in each list instead of hiding it', () => {
    addJob('https://acme.example/jobs/1', 'Design Engineer');
    window.location.hash = '#/today';
    renderApp();
    expect(within(region(/^Follow-ups due/)).getByText(/Nothing due/)).toBeInTheDocument();
    expect(within(region(/^Next 7 days/)).getByText(/Nothing scheduled/)).toBeInTheDocument();
  });

  it('with a track but no jobs, teaches the next step', () => {
    seedPack('consulting');
    window.location.hash = '#/today';
    renderApp();
    expect(screen.getByRole('textbox', { name: 'Add a job' })).toBeInTheDocument();
    expect(screen.getByText('Nothing to follow up yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Insights/ })).toBeNull();
  });
});

describe('first-run gate in the shell (#128)', () => {
  it('a first visit (no tracks, no jobs) opens on setup, with sample data on offer', () => {
    renderApp();
    expect(screen.getByRole('tab', { selected: true })).toHaveAccessibleName('Today');
    expect(screen.getByRole('heading', { name: 'Set up your board' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try with sample data' })).toBeInTheDocument();
  });

  it('trying the sample from setup lands on a working Today', async () => {
    renderApp();
    await userEvent.click(screen.getByRole('button', { name: 'Try with sample data' }));
    expect(await screen.findByRole('region', { name: /^Follow-ups due/ })).toBeInTheDocument();
  });

  it('picking a track finishes setup and shows Today', async () => {
    renderApp();
    await userEvent.click(screen.getAllByRole('checkbox')[0]);
    await userEvent.click(screen.getByRole('button', { name: /^Start with/ }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Today' })).toBeInTheDocument();
  });

  it('Discover needs a track even when there are jobs; the Pipeline never gates', () => {
    addJob('https://acme.example/jobs/1', 'Design Engineer');
    window.location.hash = '#/discover';
    const { unmount } = renderApp();
    expect(screen.getByRole('heading', { name: 'Set up your board' })).toBeInTheDocument();
    unmount();
    removeJob('https://acme.example/jobs/1');
    window.location.hash = '#/queue';
    renderApp();
    expect(screen.queryByRole('heading', { name: 'Set up your board' })).toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'Pipeline' })).toBeInTheDocument();
  });
});

describe('one-time "Today is home" notice (#128)', () => {
  const NOTICE = { name: 'Tracker is now Pipeline' };

  it('an existing user sees it once; dismissing it is remembered', async () => {
    addJob('https://acme.example/jobs/1', 'Design Engineer');
    const { unmount } = renderApp();
    const notice = screen.getByRole('region', NOTICE);
    expect(notice).toHaveTextContent(/Today is your new home/);
    await userEvent.click(within(notice).getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('region', NOTICE)).toBeNull();
    unmount();
    renderApp();
    expect(screen.queryByRole('region', NOTICE)).toBeNull();
  });

  it('a new user never sees it', async () => {
    renderApp();
    await userEvent.click(screen.getByRole('button', { name: 'Try with sample data' }));
    await screen.findByRole('region', { name: /^Follow-ups due/ });
    expect(screen.queryByRole('region', NOTICE)).toBeNull();
  });
});
