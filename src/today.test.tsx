// Phase 2b of the redesign (#128): Today is home. Tested at the route seam through App and driven
// by role + name: the empty hash lands on Today, which lists due follow-ups and the next week's
// interviews from the sample pipeline, has one quick-add field; the
// Pipeline keeps the list only; the shell owns the first-run gate; existing users get a one-time
// "Today is home" notice.
import { itemsInLine, MAX_META_ITEMS } from './metaLines';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
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
import { addJob, getAllJobs, jobIdOf, markAppliedByUrl, removeJob } from './store';
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
  window.location.hash = '#/today';
});
afterEach(() => {
  cleanup();
  getAllJobs()
    .slice()
    .forEach((j) => removeJob(j.url));
  replaceCurationState({ categories: [], groups: [], tiles: [] });
});

describe('Today is a legacy route (Calm list slice 1)', () => {
  it('an empty hash lands on Companies, not Today', async () => {
    seedPack('consulting');
    window.location.hash = '';
    renderApp();
    expect(screen.getByRole('tab', { selected: true })).toHaveAccessibleName('Companies');
    await waitFor(() => expect(window.location.hash).toBe('#/discover'));
    expect(screen.queryByRole('heading', { level: 2, name: 'Today' })).toBeNull();
  });

  it('#/today still renders Today, with no tab selected', () => {
    seedPack('consulting');
    window.location.hash = '#/today';
    renderApp();
    expect(screen.getByRole('heading', { level: 2, name: 'Today' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { selected: true })).toBeNull();
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

  it('one quick-add field saves a pasted link, stays on Today and links to the new job', async () => {
    renderApp();
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Add a job' }),
      'https://acme.example/jobs/42',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(getAllJobs().map((j) => j.url)).toContain('https://acme.example/jobs/42');
    expect(screen.getByRole('textbox', { name: 'Add a job' })).toHaveValue('');
    expect(window.location.hash).toBe('#/today');
    const status = screen.getByRole('status', { name: 'Quick add' });
    expect(status).toHaveTextContent(/Saved to your Pipeline/);
    expect(within(status).getByRole('link')).toHaveAttribute(
      'href',
      `#/queue/${jobIdOf('https://acme.example/jobs/42')}`,
    );
  });

  it('quick-add says when the job is already saved, and links to it', async () => {
    const url = 'https://larkspur.example.com/careers/senior-product-designer';
    renderApp();
    await userEvent.type(screen.getByRole('textbox', { name: 'Add a job' }), url);
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    const status = screen.getByRole('status', { name: 'Quick add' });
    expect(status).toHaveTextContent(/Already in your Pipeline/);
    expect(within(status).getByRole('link', { name: 'Senior Product Designer' })).toHaveAttribute(
      'href',
      `#/queue/${jobIdOf(url)}`,
    );
  });

  it('quick-add flags something that is not a link, in place', async () => {
    renderApp();
    await userEvent.type(screen.getByRole('textbox', { name: 'Add a job' }), 'not a link');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByRole('textbox', { name: 'Add a job' })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.getByText(/doesn't look like a link/)).toBeInTheDocument();
  });

  it('the Pipeline holds the list only: no This week or stats', () => {
    window.location.hash = '#/queue';
    renderApp();
    expect(screen.queryByText(/^This week/)).toBeNull();
    expect(screen.queryByText('Response rate')).toBeNull();
  });
});

describe('Today with nothing due', () => {
  // Slice 1 of #132: with jobs but nothing due and nothing scheduled, one "You're caught up" empty
  // replaces the two one-line lists (see emptyStates.test.tsx).
  it("with jobs but nothing due or scheduled, says you're caught up", () => {
    addJob('https://acme.example/jobs/1', 'Design Engineer');
    window.location.hash = '#/today';
    renderApp();
    expect(screen.getByText("You're caught up")).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /^Follow-ups due/ })).toBeNull();
  });

  it('with a track but no jobs, teaches the next step', () => {
    seedPack('consulting');
    window.location.hash = '#/today';
    renderApp();
    expect(screen.getByRole('textbox', { name: 'Add a job' })).toBeInTheDocument();
    expect(screen.getByText('Nothing to do yet')).toBeInTheDocument();
    expect(screen.queryByText('Response rate')).toBeNull();
  });
});

describe('first-run gate in the shell (#128)', () => {
  it('a first visit (no tracks, no jobs) opens on setup, with sample data on offer', () => {
    window.location.hash = '';
    renderApp();
    expect(screen.getByRole('tab', { selected: true })).toHaveAccessibleName('Companies');
    expect(screen.getByRole('heading', { name: 'Set up your board' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try with sample data' })).toBeInTheDocument();
  });

  it('trying the sample from setup lands on the Pipeline, and Today still works', async () => {
    window.location.hash = '';
    renderApp();
    await userEvent.click(screen.getByRole('button', { name: 'Try with sample data' }));
    expect(
      await screen.findByRole('tab', { name: 'Pipeline', selected: true }),
    ).toBeInTheDocument();
    window.location.hash = '#/today';
    expect(await screen.findByRole('region', { name: /^Follow-ups due/ })).toBeInTheDocument();
  });

  it('picking a track finishes setup and stays on Companies', async () => {
    window.location.hash = '';
    renderApp();
    await userEvent.click(screen.getAllByRole('checkbox')[0]);
    // Three steps (#132): Continue, Continue, Finish.
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await userEvent.click(screen.getByRole('button', { name: 'Finish' }));
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Set up your board' })).toBeNull(),
    );
    expect(
      within(screen.getByRole('tablist', { name: 'Sections' })).getByRole('tab', {
        selected: true,
      }),
    ).toHaveAccessibleName('Companies');
    expect(window.location.hash).toBe('#/discover');
  });

  it('Discover needs a track even when there are jobs; the Pipeline never gates', () => {
    addJob('https://acme.example/jobs/1', 'Design Engineer');
    window.location.hash = '#/discover';
    const { unmount } = renderApp();
    expect(screen.getByText('Pick a track to search')).toBeInTheDocument();
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

  it('a signed-in visit is not taken for a first run while sync is still bringing data down', async () => {
    localStorage.setItem('sb-test-auth-token', '{}'); // a stored session, as supabase-js keeps it
    h.fake!.failNext('tracker', 'select'); // offline: the pull fails, so sync never settles
    renderApp();
    await new Promise((r) => setTimeout(r, 0)); // the session check answers before the user loads
    act(() => h.fake!.signIn('u1'));
    await new Promise((r) => setTimeout(r, 50));
    expect(localStorage.getItem('rjb_ui_today_home_seen')).toBeNull();
  });

  it('a first run never sees it', async () => {
    window.location.hash = '';
    renderApp();
    await userEvent.click(screen.getByRole('button', { name: 'Try with sample data' }));
    window.location.hash = '#/today';
    await screen.findByRole('region', { name: /^Follow-ups due/ });
    expect(screen.queryByRole('region', NOTICE)).toBeNull();
  });
});

// Slice 5 of #132: a three-item "Getting started" card after the first job. Ticks come from real
// state; Dismiss is remembered per device (rjb_ui_getting_started_done).
describe('Getting started card (#132)', () => {
  const card = () => screen.queryByRole('region', { name: 'Getting started' });
  const ticks = () =>
    within(card()!)
      .getAllByRole('checkbox')
      .map((c) => [
        c.getAttribute('aria-label') ?? c.parentElement?.textContent,
        (c as HTMLInputElement).checked,
      ]);

  it('is not shown before there is a job of your own, nor for sample data alone', () => {
    seedPack('consulting');
    window.location.hash = '#/today';
    const { unmount } = renderApp();
    expect(card()).toBeNull();
    unmount();
    loadSample();
    renderApp();
    expect(card()).toBeNull();
  });

  it('after the first job it lists three steps and ticks the ones that are true', () => {
    addJob('https://acme.example/jobs/1', 'Design Engineer');
    window.location.hash = '#/today';
    renderApp();
    expect(ticks()).toEqual([
      [expect.stringMatching(/Save a job/), true],
      [expect.stringMatching(/Log a follow-up date or mark a job applied/), false],
      [expect.stringMatching(/Sign in to sync/), false],
    ]);
  });

  it('marking a job applied ticks the second step', () => {
    addJob('https://acme.example/jobs/1', 'Design Engineer');
    markAppliedByUrl('https://acme.example/jobs/1');
    window.location.hash = '#/today';
    renderApp();
    expect(ticks().map((t) => t[1])).toEqual([true, true, false]);
  });

  it('Dismiss hides it and it stays gone', async () => {
    addJob('https://acme.example/jobs/1', 'Design Engineer');
    window.location.hash = '#/today';
    const { unmount } = renderApp();
    await userEvent.click(within(card()!).getByRole('button', { name: 'Dismiss' }));
    expect(card()).toBeNull();
    expect(localStorage.getItem('rjb_ui_getting_started_done')).toBe('1');
    unmount();
    renderApp();
    expect(card()).toBeNull();
  });
});

describe('Today rows keep to two items per dotted line (#192)', () => {
  it('no line in a row holds three or more " · " items', () => {
    loadSample();
    window.location.hash = '#/today';
    renderApp();
    const lines = [region(/^Follow-ups due/), region(/^Next 7 days/)].flatMap((r) =>
      [...r.querySelectorAll('li *')]
        .filter((e) => e.children.length === 0)
        .map((e) => e.textContent ?? ''),
    );
    expect(lines.some((l) => l.includes(' · '))).toBe(true); // the scan sees real dotted lines
    expect(lines.filter((l) => itemsInLine(l) > MAX_META_ITEMS)).toEqual([]);
  });
});
