import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@hirobius/design-system';
import TrackerView from './TrackerView';
import { addJob, getAllJobs, markAppliedByUrl, removeJob } from './store';

afterEach(() => {
  cleanup();
  getAllJobs()
    .slice()
    .forEach((j) => removeJob(j.url));
});

const renderTracker = () =>
  render(
    <ToastProvider>
      <TrackerView />
    </ToastProvider>,
  );

describe('TrackerView', () => {
  it('adds a pasted job URL from the Add job dialog', async () => {
    const user = userEvent.setup();
    renderTracker();
    await user.click(screen.getByRole('button', { name: 'Add job' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add a job' });
    await user.type(
      within(dialog).getByLabelText(/job url/i),
      'https://boards.greenhouse.io/acme/jobs/42',
    );
    await user.click(within(dialog).getByRole('button', { name: /^add$/i }));
    expect(await screen.findByRole('link', { name: 'Acme · Greenhouse' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

// #115 / #129: one toolbar (search · status · sort · add) instead of a full-width URL field plus an
// 8-option status strip.
describe('Pipeline toolbar', () => {
  it('has no status strip; status is one menu button showing the current view', () => {
    addJob('https://acme.example/jobs/1', 'Design Engineer');
    renderTracker();
    expect(screen.queryByRole('radiogroup', { name: /status/i })).toBeNull();
    expect(screen.getByRole('button', { name: /^Status: Active/ })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Search saved jobs' })).toBeInTheDocument();
  });

  it('groups the status options with counts, and picking one filters the list', async () => {
    const user = userEvent.setup();
    addJob('https://acme.example/jobs/1', 'Design Engineer');
    addJob('https://acme.example/jobs/2', 'Product Designer');
    markAppliedByUrl('https://acme.example/jobs/2', 'Product Designer');
    renderTracker();

    await user.click(screen.getByRole('button', { name: /^Status:/ }));
    const menu = await screen.findByRole('menu');
    for (const group of ['Views', 'In progress', 'Closed'])
      expect(within(menu).getByText(group)).toBeInTheDocument();
    await user.click(within(menu).getByRole('menuitemradio', { name: /^Applied\s*1$/ }));

    expect(screen.getByRole('button', { name: /^Status: Applied/ })).toBeInTheDocument();
    // Also listed under Follow up, so more than one match.
    expect(screen.getAllByText('Product Designer').length).toBeGreaterThan(0);
    expect(screen.queryByText('Design Engineer')).toBeNull();
  });
});

// Hierarchy pass (Adrian's review of the empty Pipeline): one page header with the primary
// action, a first-use empty state with one primary + one secondary action, and no toolbar while
// there is nothing to search or filter.
describe('Pipeline hierarchy', () => {
  it('opens with a Pipeline page header whose action is Add job', () => {
    addJob('https://acme.example/jobs/1', 'Design Engineer');
    renderTracker();
    const heading = screen.getByRole('heading', { level: 2, name: 'Pipeline' });
    const header = heading.closest('header')!;
    expect(within(header).getByRole('button', { name: 'Add job' })).toBeInTheDocument();
  });

  it('first use: no toolbar, a teaching empty state with Add job + sample data', () => {
    renderTracker();
    // One primary action on the screen: the empty state's, not a second one in the header.
    expect(screen.getAllByRole('button', { name: 'Add job' })).toHaveLength(1);
    expect(screen.queryByRole('textbox', { name: 'Search saved jobs' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Status:/ })).toBeNull();
    expect(screen.getByText('Track your first job')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try with sample data' })).toBeInTheDocument();
  });

  it('first use is the shared EmptyState, with its icon (#176 review)', () => {
    const { container } = renderTracker();
    const title = screen.getByText('Track your first job');
    // The shared composition's HDS EmptyState, not a hand-built column.
    expect(
      title.closest('[class*="EmptyState"], [data-hds-component="EmptyState"]'),
    ).not.toBeNull();
    expect(container.querySelector('svg.lucide-briefcase')).not.toBeNull();
  });

  it('with jobs: the toolbar is back and the header shows the counts', () => {
    addJob('https://acme.example/jobs/1', 'Design Engineer');
    renderTracker();
    expect(screen.getByRole('textbox', { name: 'Search saved jobs' })).toBeInTheDocument();
    // On its own line straight under the title (rev-3: 4px under it), not beside it and not
    // after the actions row (where PageHeader's description sits).
    const title = screen.getByRole('heading', { level: 2, name: 'Pipeline' });
    expect(title.closest('header')).not.toBeNull();
    expect(title.nextElementSibling?.textContent).toBe('1 active · 1 total');
  });

  it('first use says 0 jobs under the title', () => {
    renderTracker();
    const title = screen.getByRole('heading', { level: 2, name: 'Pipeline' });
    expect(title.nextElementSibling?.textContent).toBe('0 jobs');
  });
});

// Rev-3 s-pipeline-filtered-empty: the empty message has its own section with a way back.
describe('Pipeline filtered to nothing', () => {
  it('a search with no match: no period, a helper line and Clear search', async () => {
    const user = userEvent.setup();
    addJob('https://acme.example/jobs/1', 'Design Engineer');
    renderTracker();
    await user.type(screen.getByRole('textbox', { name: 'Search saved jobs' }), 'zzz nothing');
    expect(screen.getByText('No jobs match "zzz nothing"')).toBeInTheDocument();
    expect(screen.getByText('Try a shorter word, or clear the search.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByRole('textbox', { name: 'Search saved jobs' })).toHaveValue('');
    expect(screen.getByRole('link', { name: 'Design Engineer' })).toBeInTheDocument();
  });

  it('a status with no jobs: Try another status, and Show active goes back', async () => {
    const user = userEvent.setup();
    addJob('https://acme.example/jobs/1', 'Design Engineer');
    renderTracker();
    await user.click(screen.getByRole('button', { name: /^Status:/ }));
    await user.click(await screen.findByRole('menuitemradio', { name: /^Offer/ }));
    expect(screen.getByText('Try another status.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show active' }));
    expect(screen.getByRole('button', { name: /^Status: Active/ })).toBeInTheDocument();
  });

  it('nothing left to apply to: a plain title, no em dash', async () => {
    addJob('https://acme.example/jobs/1', 'Design Engineer');
    markAppliedByUrl('https://acme.example/jobs/1', 'Design Engineer');
    renderTracker();
    expect(screen.getByText('Nothing left to apply to')).toBeInTheDocument();
    expect(screen.getByText('Check Applied, or add more jobs.')).toBeInTheDocument();
  });
});

// Roomy layout: Status and Sort are quiet menu triggers, so each says what it is and its value
// in visible text ("Status: Active"), the name and the text one string.
describe('Status and Sort say what they are and their value', () => {
  it('the visible text is the name: "Status: Active", "Sort: Newest"', () => {
    addJob('https://acme.example/jobs/1', 'Design Engineer');
    renderTracker();
    expect(screen.getByRole('button', { name: 'Status: Active' }).textContent).toBe(
      'Status: Active',
    );
    expect(screen.getByRole('button', { name: 'Sort: Newest' }).textContent).toBe('Sort: Newest');
  });
});

// The Pipeline holds no stats or funnel (#128); its agenda is the Follow up section (#236).
describe('Pipeline holds the list only', () => {
  it('has no This week agenda or Insights band', () => {
    addJob('https://acme.example/jobs/1', 'Design Engineer');
    renderTracker();
    expect(screen.queryByRole('button', { name: /Insights/ })).toBeNull();
    expect(screen.queryByText(/^This week/)).toBeNull();
  });
});
