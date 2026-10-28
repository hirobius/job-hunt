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
import { writeShowEngineering } from './feed/roleTypePref';
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
    label: 'Design work',
    titles: ['design engineer', 'design technologist', 'design system'],
    atsRoles: ['design system'],
  });
  // These pin the title filter, not role types: keep the engineering-heavy roles in the list.
  writeShowEngineering(cat, true);
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
    await screen.findByText('design system', { selector: '.rjb-chip-text' });
    expect(rows()).toHaveLength(3);
    const chips = screen.getByRole('group', { name: 'Show titles' });
    // All first, with the total; counts are Badges, not "(n)"; only the selected chip is filled.
    const all = within(chips).getByRole('button', { name: /^All,\s?3$/ });
    expect(all).toHaveAttribute('aria-pressed', 'true');
    expect(within(chips).getByRole('button', { name: /^design engineer,\s?2$/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(within(chips).getByRole('button', { name: /^design system,\s?1$/ })).toBeInTheDocument();
    // WCAG 2.5.3 (#317): each name is its visible text (no aria-label over it), and "+N more"
    // starts with what it shows, so a voice user can say it.
    for (const chip of within(chips).getAllByRole('button'))
      expect(chip).not.toHaveAttribute('aria-label');
  });

  it('"+N more" is named by what it shows (WCAG 2.5.3, #317)', async () => {
    // No Design Technologist posting: that title's chip folds into "+1 more".
    feed.fetchFeed.mockResolvedValue({ postings: [POSTINGS[0], POSTINGS[2]], sources: [] });
    const user = await startSweep();
    const chips = await screen.findByRole('group', { name: 'Show titles' });
    const more = within(chips).getByRole('button', {
      name: /^\+1 more\s?titles with no openings$/,
    });
    expect(more).not.toHaveAttribute('aria-label');
    await user.click(more);
    expect(within(chips).getByRole('button', { name: /^design technologist,\s?0$/ })).toBeVisible();
  });

  it('a title chip shows only its results without a re-fetch, and All brings the rest back', async () => {
    const user = await startSweep();
    await screen.findByText('design system', { selector: '.rjb-chip-text' });
    const calls = feed.fetchFeed.mock.calls.length;
    await user.click(screen.getByRole('button', { name: /^design system,\s?1$/ }));
    expect(rows()).toEqual(['Design Engineer']);
    await user.click(screen.getByRole('button', { name: /^All,\s?3$/ }));
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

  // #354: Remove is soft (#212): the notice offers Undo, and Undo restores the title, its
  // place in the list and its tick state.
  it('removing a title offers Undo that restores it, in place, with its tick state', async () => {
    const user = await startSweep();
    await user.click(screen.getByRole('button', { name: /^Calibrate/ }));
    await user.click(screen.getByRole('checkbox', { name: 'design technologist' }));
    expect(getAllSweeps()[cat].off).toEqual(['design technologist']);
    await user.click(screen.getByRole('button', { name: 'Remove title design technologist' }));
    expect(getAllSweeps()[cat].titles).toEqual(['design engineer', 'design system']);
    expect(await screen.findByText('Removed “design technologist”')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(getAllSweeps()[cat].titles).toEqual([
      'design engineer',
      'design technologist',
      'design system',
    ]);
    expect(getAllSweeps()[cat].off).toEqual(['design technologist']);
  });

  it('adding a title already listed says so and changes nothing', async () => {
    const user = await startSweep();
    await user.click(screen.getByRole('button', { name: /^Calibrate/ }));
    await user.type(screen.getByRole('textbox', { name: 'Add a title' }), 'Design System');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('design system is already in the list')).toBeInTheDocument();
    expect(getAllSweeps()[cat]).toBeUndefined();
  });

  it('saving a swept posting lands it in the Pipeline To apply queue', async () => {
    const user = await startSweep();
    await screen.findByText('design system', { selector: '.rjb-chip-text' });
    const list = screen.getByRole('list', { name: 'Live postings' });
    // The design-systems track lists the Design Technologist first; save Co 1's Design Engineer.
    const row = within(list)
      .getAllByRole('listitem')
      .find((li) => within(li).queryByText('Co 1'))!;
    await user.click(within(row).getByRole('button', { name: 'Save' }));
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
