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

// #115 / #129: one compact toolbar (search · status · sort · add) instead of a full-width URL
// field plus an 8-option status strip.
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
    expect(screen.getByText('1 active · 1 total')).toBeInTheDocument();
  });
});

// The Pipeline holds the list only (#128): the agenda, stats and funnel moved to Today.
describe('Pipeline holds the list only', () => {
  it('has no This week agenda or Insights band', () => {
    addJob('https://acme.example/jobs/1', 'Design Engineer');
    renderTracker();
    expect(screen.queryByRole('button', { name: /Insights/ })).toBeNull();
    expect(screen.queryByText(/^This week/)).toBeNull();
  });
});
