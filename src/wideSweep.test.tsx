// The wide sweep (#213), pinned at the route seam: App at #/discover/live, driven by role and name.
// One sweep searches every title that is on; results are tagged by title, filterable without a
// re-fetch, and save into the Pipeline's To apply queue like any other save.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@hirobius/design-system';

vi.mock('@supabase/supabase-js', async () => {
  const { createFakeSupabase } = await import('./test/fakeSupabase');
  return { createClient: () => createFakeSupabase().client };
});
const feed = vi.hoisted(() => ({ fetchFeed: vi.fn() }));
vi.mock('./feed/fetchFeed', () => feed);

import { ColorModeProvider } from './ColorMode';
import App from './App';
import { addCategory, replaceCurationState } from './curation/curationStore';
import { EMPTY_CURATION } from './curation/types';
import { getAllSweeps } from './feed/sweepTitles';
import { findJobByUrl, getAllJobs, removeJob } from './store';
import { dismissNotice } from './saveNotice';
import type { Posting } from './feed/types';

const post = (id: string, title: string, text = ''): Posting => ({
  id,
  source: 'ashby',
  title,
  company: `Co ${id}`,
  url: `https://jobs.ashbyhq.com/co/${id}`,
  location: '',
  text,
});
const POSTINGS = [
  post('1', 'Design Engineer', 'Own the design system.'),
  post('2', 'Design Technologist'),
  post('3', 'Design Engineer, Web'),
];

const renderApp = () =>
  render(
    <ColorModeProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ColorModeProvider>,
  );

let cat: string;
beforeEach(() => {
  localStorage.clear();
  feed.fetchFeed.mockReset().mockResolvedValue({ postings: POSTINGS, sources: [] });
  replaceCurationState(EMPTY_CURATION);
  cat = addCategory({
    label: 'Design Systems',
    titles: ['design engineer', 'design technologist', 'design system'],
    atsRoles: ['design system'],
  });
  window.history.replaceState(null, '', '/');
  window.location.hash = '#/discover/live';
});
afterEach(() => {
  cleanup();
  act(() => dismissNotice());
  getAllJobs()
    .slice()
    .forEach((j) => removeJob(j.url));
});

const startSweep = async () => {
  const user = userEvent.setup();
  renderApp();
  await screen.findByRole('list', { name: 'Live postings' });
  await user.click(screen.getByRole('button', { name: 'Find more' }));
  await screen.findByRole('heading', { name: 'Sweeping 3 titles' });
  return user;
};
const rows = () =>
  within(screen.getByRole('list', { name: 'Live postings' }))
    .getAllByRole('heading', { level: 3 })
    .map((h) => h.textContent?.replace(' (opens in new tab)', ''));

describe('wide sweep', () => {
  it('runs every title in one search, merged, deduped and tagged by title', async () => {
    await startSweep();
    expect(feed.fetchFeed).toHaveBeenLastCalledWith(
      expect.objectContaining({
        terms: ['design engineer', 'design technologist', 'design system'],
      }),
    );
    // A row names the other titles it matched as chips (rev-3 K), not its own.
    await screen.findByText('design system', { selector: '.rjb-chip' });
    expect(rows()).toHaveLength(3);
    const chips = screen.getByRole('group', { name: 'Show titles' });
    // All first, with the total; counts are Badges, not "(n)"; only the selected chip is filled.
    const all = within(chips).getByRole('button', { name: 'All, 3' });
    expect(all).toHaveAttribute('aria-pressed', 'true');
    expect(within(chips).getByRole('button', { name: 'design engineer, 2' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(within(chips).getByRole('button', { name: 'design system, 1' })).toBeInTheDocument();
  });

  it('a title chip shows only its results without a re-fetch, and All brings the rest back', async () => {
    const user = await startSweep();
    await screen.findByText('design system', { selector: '.rjb-chip' });
    const calls = feed.fetchFeed.mock.calls.length;
    await user.click(screen.getByRole('button', { name: 'design system, 1' }));
    expect(rows()).toEqual(['Design Engineer']);
    await user.click(screen.getByRole('button', { name: 'All, 3' }));
    expect(rows()).toHaveLength(3);
    expect(feed.fetchFeed.mock.calls.length).toBe(calls);
  });

  it('turning a title off is saved per track and drops it from the next sweep', async () => {
    const user = await startSweep();
    await user.click(screen.getByRole('button', { name: /^Calibrate/ }));
    await user.click(screen.getByRole('checkbox', { name: 'design technologist' }));
    expect(getAllSweeps()[cat].off).toEqual(['design technologist']);
    await screen.findByRole('heading', { name: 'Sweeping 2 titles' });
    expect(feed.fetchFeed).toHaveBeenLastCalledWith(
      expect.objectContaining({ terms: ['design engineer', 'design system'] }),
    );
  });

  it('adds and removes titles from the sweep list', async () => {
    const user = await startSweep();
    await user.click(screen.getByRole('button', { name: /^Calibrate/ }));
    await user.type(screen.getByRole('textbox', { name: 'Add a title' }), 'UX engineer');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await user.click(screen.getByRole('button', { name: 'Remove title design system' }));
    expect(getAllSweeps()[cat].titles).toEqual([
      'design engineer',
      'design technologist',
      'UX engineer',
    ]);
  });

  it('saving a swept posting lands it in the Pipeline To apply queue', async () => {
    const user = await startSweep();
    await screen.findByText('design system', { selector: '.rjb-chip' });
    const list = screen.getByRole('list', { name: 'Live postings' });
    await user.click(within(list).getAllByRole('button', { name: 'Save' })[0]);
    expect(await screen.findByText('Saved to Pipeline · To apply')).toBeInTheDocument();
    const job = findJobByUrl(POSTINGS[0].url)!;
    expect(job.status).toBe('Saved');
    expect(job.note).toContain('“design engineer, design system”');
  });

  it('Back to one search returns to the single-term search', async () => {
    const user = await startSweep();
    await user.click(screen.getByRole('button', { name: 'Back to one search' }));
    expect(screen.getByRole('textbox', { name: 'Search term' })).toBeInTheDocument();
    expect(feed.fetchFeed).toHaveBeenLastCalledWith(
      expect.objectContaining({ term: 'design system' }),
    );
  });
});

/** ATS search's board lists start closed and its hiring systems show three (rev-3 mock): open
 *  them all, so every generated link is on the page. */
const openAllBoards = async () => {
  for (const name of [
    /^Big job boards/,
    /^Freelance, startup and remote boards/,
    /^Show \d+ more$/,
  ])
    await userEvent.click(await screen.findByRole('button', { name }));
};

describe('ATS search: All selected', () => {
  it('the big-board links OR every title that is on, from the start', async () => {
    window.location.hash = '#/discover/ats';
    renderApp();
    await openAllBoards();
    const href = screen.getAllByRole('link', { name: /search/i })[0].getAttribute('href') ?? '';
    expect(decodeURIComponent(href)).toContain(
      '("design engineer" OR "design technologist" OR "design system")',
    );
  });

  it('ATS search ORs them too', async () => {
    window.location.hash = '#/discover/ats';
    const user = userEvent.setup();
    renderApp();
    await user.click(await screen.findByRole('button', { name: 'All selected (3)' }));
    const href = screen.getAllByRole('link', { name: /search/i })[0].getAttribute('href') ?? '';
    expect(decodeURIComponent(href.replace(/\+/g, ' '))).toContain(
      '("design engineer" OR "design technologist" OR "design system")',
    );
  });
});
