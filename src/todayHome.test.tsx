// Simplify 2/9 (#383): Today is home. Three sections in a fixed order (Review new, Apply, Follow
// up), each opening what already exists: Live postings, Apply mode and the follow-up dialog. The
// Pipeline stays reachable as the Jobs tab, unchanged inside; Companies keeps its tab. Tested at
// the route seam through App and driven by role + name.
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
import { addJob, getAllJobs, jobIdOf, markAppliedByUrl, removeJob, updateJob } from './store';
import { ymd } from './jobEvents';
import { replaceCurationState } from './curation/curationStore';
import { seedPack } from './curation/starterPacks';
import { watchBoard } from './feed/watchlist';

const renderApp = () =>
  render(
    <ColorModeProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ColorModeProvider>,
  );

const section = (name: RegExp) => screen.getByRole('region', { name });
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
};

beforeEach(() => {
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

describe('Today is home (#383)', () => {
  it('an empty hash lands on Today, with Today · Companies · Jobs as the tabs', async () => {
    seedPack('consulting');
    renderApp();
    await waitFor(() => expect(window.location.hash).toBe('#/today'));
    expect(screen.getByRole('heading', { level: 2, name: 'Today' })).toBeInTheDocument();
    const tabs = screen.getAllByRole('tab').map((t) => t.textContent);
    expect(tabs).toEqual(['Today', 'Companies', 'Jobs']);
    expect(screen.getByRole('tab', { selected: true })).toHaveAccessibleName('Today');
    expect(document.title).toMatch(/^Today/);
  });

  it('shows Review new, Apply and Follow up, in that order', async () => {
    seedPack('consulting');
    window.location.hash = '#/today';
    renderApp();
    const names = (await within(screen.getByRole('main')).findAllByRole('region')).map((r) =>
      r.getAttribute('aria-label'),
    );
    expect(names.map((n) => n?.replace(/ \(.*$/, ''))).toEqual([
      'Review new',
      'Apply',
      'Follow up',
    ]);
  });

  it('a first run shows onboarding, as Companies does', async () => {
    renderApp();
    await waitFor(() => expect(window.location.hash).toBe('#/today'));
    expect(await screen.findByRole('button', { name: /sample data/i })).toBeInTheDocument();
  });
});

describe('Review new', () => {
  it('names its sources and opens Live postings, with Today as the way back', async () => {
    const track = seedPack('consulting');
    watchBoard(track, 'https://jobs.ashbyhq.com/ramp');
    window.location.hash = '#/today';
    renderApp();
    const review = section(/^Review new/);
    expect(within(review).getByText(/^New postings from \d+ sources$/)).toBeInTheDocument();
    const browse = within(review).getByRole('link', { name: 'Browse new postings' });
    expect(browse).toHaveAttribute('href', '#/discover/live?from=%2Ftoday');
  });
});

describe('Apply', () => {
  it('counts To apply and Start applying opens Apply mode on its head', async () => {
    seedPack('consulting');
    addJob('https://acme.example.com/jobs/1', 'Designer');
    addJob('https://beta.example.com/jobs/2', 'Engineer');
    window.location.hash = '#/today';
    renderApp();
    const apply = section(/^Apply/);
    expect(within(apply).getByText('2 saved jobs, not yet applied')).toBeInTheDocument();
    await userEvent.click(within(apply).getByRole('button', { name: 'Start applying' }));
    await waitFor(() =>
      expect(window.location.hash).toMatch(
        // Today is its way back (return paths).
        new RegExp(`^#/apply/${jobIdOf('https://beta.example.com/jobs/2')}\\?from=%2Ftoday$`),
      ),
    );
  });

  it('with nothing saved, Start applying is off', async () => {
    seedPack('consulting');
    window.location.hash = '#/today';
    renderApp();
    const apply = section(/^Apply/);
    expect(within(apply).getByText('Nothing saved to apply to yet')).toBeInTheDocument();
    expect(within(apply).getByRole('button', { name: 'Start applying' })).toBeDisabled();
  });
});

describe('Follow up', () => {
  it('names the due companies and opens the follow-up dialog on the first', async () => {
    seedPack('consulting');
    const url = 'https://acme.example.com/jobs/1';
    addJob(url, 'Designer');
    markAppliedByUrl(url);
    // Applied 9 days ago: due.
    updateJob(getAllJobs()[0].url, { applied: ymd(daysAgo(9)), company: 'Acme' });
    window.location.hash = '#/today';
    renderApp();
    const follow = section(/^Follow up/);
    expect(within(follow).getByText('Due: Acme')).toBeInTheDocument();
    await userEvent.click(within(follow).getByRole('button', { name: /^Follow up/ }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('says so when nothing waits on a reply', async () => {
    seedPack('consulting');
    window.location.hash = '#/today';
    renderApp();
    expect(
      within(section(/^Follow up/)).getByText('Nothing waiting on a reply'),
    ).toBeInTheDocument();
  });
});

describe('Jobs', () => {
  it('the Jobs tab opens the Pipeline, unchanged inside', async () => {
    seedPack('consulting');
    window.location.hash = '#/today';
    renderApp();
    await userEvent.click(screen.getByRole('tab', { name: 'Jobs' }));
    await waitFor(() => expect(window.location.hash).toBe('#/queue'));
    expect(screen.getByRole('heading', { level: 2, name: 'Pipeline' })).toBeInTheDocument();
  });
});
