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

/** Open the Add job dialog from the page (the first-use empty state's button when there are none). */
async function openAddJob(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getAllByRole('button', { name: 'Add job' })[0]);
  return screen.findByRole('dialog', { name: 'Add a job' });
}

describe('TrackerView', () => {
  it('adds a pasted job URL from the Add job dialog', async () => {
    const user = userEvent.setup();
    renderTracker();
    const dialog = await openAddJob(user);
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Job link' }),
      'https://boards.greenhouse.io/acme/jobs/42',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Add job' }));
    expect(await screen.findByRole('link', { name: 'Acme · Greenhouse' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Enter in the field adds the job too', async () => {
    const user = userEvent.setup();
    renderTracker();
    const dialog = await openAddJob(user);
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Job link' }),
      'https://jobs.lever.co/acme/1{Enter}',
    );
    expect(getAllJobs()).toHaveLength(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

// QA (rf-polish): a link that isn't one, or no link, said nothing and the dialog just closed; the
// rev-3 mock keeps Add job the one primary, never greyed out, with a field error instead.
describe('Add job dialog', () => {
  it('Add job is never disabled; an empty link shows a field error and keeps the dialog open', async () => {
    const user = userEvent.setup();
    renderTracker();
    const dialog = await openAddJob(user);
    const add = within(dialog).getByRole('button', { name: 'Add job' });
    expect(add).toBeEnabled();
    await user.click(add);
    expect(screen.getByRole('dialog', { name: 'Add a job' })).toBeInTheDocument();
    const field = within(dialog).getByRole('textbox', { name: 'Job link' });
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAccessibleDescription('Paste a job link');
  });

  it('a link that is not one says how to fix it, saves nothing and keeps the dialog open', async () => {
    const user = userEvent.setup();
    renderTracker();
    const dialog = await openAddJob(user);
    const field = within(dialog).getByRole('textbox', { name: 'Job link' });
    await user.type(field, 'not a url');
    await user.click(within(dialog).getByRole('button', { name: 'Add job' }));
    expect(getAllJobs()).toHaveLength(0);
    expect(screen.getByRole('dialog', { name: 'Add a job' })).toBeInTheDocument();
    expect(field).toHaveValue('not a url');
    expect(field).toHaveAccessibleDescription('Paste the full link to the posting, like https://…');
    // Typing again clears the error.
    await user.type(field, 'x');
    expect(field).not.toHaveAttribute('aria-invalid', 'true');
  });

  it('says where the title comes from under the field, and is placed like the other shell sheets', async () => {
    const user = userEvent.setup();
    renderTracker();
    const dialog = await openAddJob(user);
    expect(within(dialog).getByRole('textbox', { name: 'Job link' })).toHaveAccessibleDescription(
      'The title fills in from the link. You can edit it after.',
    );
    expect(dialog).toHaveClass('rjb-sheet');
    // Add job first in the DOM (on top on a phone), then Cancel.
    const names = within(dialog)
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(names.indexOf('Add job')).toBeLessThan(names.indexOf('Cancel'));
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
    for (const group of ['Views', 'In progress', 'Closing date', 'Ended'])
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
    const heading = screen.getByRole('heading', { level: 1, name: 'Apply' });
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
    const title = screen.getByRole('heading', { level: 1, name: 'Apply' });
    expect(title.closest('header')).not.toBeNull();
    expect(title.nextElementSibling?.textContent).toBe('1 active · 1 total');
  });

  it('first use has no count under the title: the empty state says it (retro quick wins)', () => {
    renderTracker();
    const title = screen.getByRole('heading', { level: 1, name: 'Apply' });
    expect(title.nextElementSibling).toBeNull();
    expect(screen.queryByText('0 jobs')).toBeNull();
    expect(screen.getByText('Track your first job')).toBeInTheDocument();
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

describe('Status and Sort show only their value', () => {
  it('the prefix lives in the name, not the visible text', () => {
    addJob('https://acme.example/jobs/1', 'Design Engineer');
    renderTracker();
    expect(screen.getByRole('button', { name: /^Status: Active/ }).textContent).toBe('Active');
    expect(screen.getByRole('button', { name: /^Sort:/ }).textContent).not.toMatch(/^Sort/);
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
