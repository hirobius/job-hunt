import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@hirobius/design-system';
import TrackerView, { JobsList } from './TrackerView';
import { CloudSyncContext, type CloudSyncApi } from './account/accountContext';
import { addJob, getAllJobs, markAppliedByUrl, removeJob, updateJob } from './store';

afterEach(() => {
  cleanup();
  getAllJobs()
    .slice()
    .forEach((j) => removeJob(j.url));
});

// With jobs the tab is the first job's Apply view (Proposal A, Adrian 2026-11-08), which reads sync.
const renderTracker = () =>
  render(
    <CloudSyncContext.Provider value={{ user: null, settled: true } as unknown as CloudSyncApi}>
      <ToastProvider>
        <TrackerView />
      </ToastProvider>
    </CloudSyncContext.Provider>,
  );
/** The Apply list itself (on a phone, the All jobs sheet's body). */
const renderList = () =>
  render(
    <ToastProvider>
      <JobsList />
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
    // The tab is now that job (Proposal A).
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Acme · Greenhouse' }),
    ).toBeInTheDocument();
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
  it('has no Status select: the named views are chips, To apply pressed (#541)', () => {
    addJob('https://acme.example/jobs/1', 'Design Engineer');
    renderList();
    expect(screen.queryByRole('button', { name: /^Status:/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'To apply 1' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText('Saved and still open, closing soonest first.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Search saved jobs' })).toBeInTheDocument();
  });

  it('each view has a count, and picking one filters the list and says what it holds', async () => {
    const user = userEvent.setup();
    addJob('https://acme.example/jobs/1', 'Design Engineer');
    addJob('https://acme.example/jobs/2', 'Product Designer');
    markAppliedByUrl('https://acme.example/jobs/2', 'Product Designer');
    renderList();

    await user.click(screen.getByRole('button', { name: 'Applied 1' }));
    expect(screen.getByRole('button', { name: 'Applied 1' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText('Sent, waiting to hear back.')).toBeInTheDocument();
    expect(screen.getAllByText('Product Designer').length).toBeGreaterThan(0);
    expect(screen.queryByText('Design Engineer')).toBeNull();
  });

  it('Follow up shows an amber count while a follow-up is due, a neutral one otherwise', () => {
    addJob('https://acme.example/jobs/1', 'Design Engineer');
    renderList();
    const neutral = within(screen.getByRole('button', { name: 'Follow up 0' })).getByText('0');
    expect(neutral.className).not.toMatch(/warning/);
    cleanup();
    markAppliedByUrl('https://acme.example/jobs/1', 'Design Engineer');
    const d = new Date();
    d.setDate(d.getDate() - 10);
    updateJob('https://acme.example/jobs/1', { applied: d.toISOString().slice(0, 10) });
    renderList();
    const due = within(screen.getByRole('button', { name: 'Follow up 1' })).getByText('1');
    expect(due.className).toMatch(/warning/);
  });
});

// Hierarchy pass (Adrian's review of the empty Pipeline): one page header with the primary
// action, a first-use empty state with one primary + one secondary action, and no toolbar while
// there is nothing to search or filter.
describe('Pipeline hierarchy', () => {
  it('with jobs the tab is the first job; Filters, Add job and the status line left it (#543)', () => {
    addJob('https://acme.example/jobs/1', 'Design Engineer');
    renderTracker();
    expect(screen.getByRole('heading', { level: 1, name: 'Design Engineer' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Filter jobs' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Filters' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add job' })).toBeNull();
    expect(screen.queryByRole('switch', { name: 'Remote only' })).toBeNull();
    expect(screen.queryByText('To apply · 1 job')).toBeNull();
  });

  it('the All jobs list owns Add job, the views, search, the filter chips and Sort (#543)', async () => {
    const user = userEvent.setup();
    addJob('https://acme.example/jobs/1', 'Design Engineer');
    renderList();
    expect(screen.getByRole('button', { name: 'Add job' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Views' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Search saved jobs' })).toBeInTheDocument();
    const filters = screen.getByRole('group', { name: 'Filters' });
    const remote = within(filters).getByRole('button', { name: 'Remote only' });
    expect(remote).toHaveAttribute('aria-pressed', 'false');
    expect(within(filters).getByRole('button', { name: /^Sort: / })).toBeInTheDocument();
    // "Clear N" only while a filter is on; it clears them all.
    expect(within(filters).queryByRole('button', { name: /^Clear / })).toBeNull();
    await user.click(remote);
    await user.type(screen.getByRole('textbox', { name: 'Search saved jobs' }), 'Design');
    const clear = within(filters).getByRole('button', { name: 'Clear 2 filters' });
    expect(clear).toHaveTextContent('Clear 2');
    await user.click(clear);
    expect(screen.getByRole('button', { name: 'Remote only' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('textbox', { name: 'Search saved jobs' })).toHaveValue('');
    expect(screen.getByRole('textbox', { name: 'Search saved jobs' })).toHaveFocus();
  });

  it('the rows sit on one surface: links named by the title, no card, key or posting glyph (#543)', async () => {
    const user = userEvent.setup();
    addJob('https://acme.example/jobs/1', 'Design Engineer');
    markAppliedByUrl('https://acme.example/jobs/1', 'Design Engineer');
    const d = new Date();
    d.setDate(d.getDate() - 10);
    updateJob('https://acme.example/jobs/1', { applied: d.toISOString().slice(0, 10) });
    renderList();
    // A due follow-up: no per-row Follow up key any more.
    await user.click(screen.getByRole('button', { name: 'Follow up 1' }));
    const nav = screen.getByRole('navigation', { name: 'Jobs' });
    expect(within(nav).getByRole('link', { name: 'Design Engineer' })).toBeInTheDocument();
    expect(within(nav).getAllByRole('link')).toHaveLength(1);
    expect(within(nav).queryAllByRole('button')).toEqual([]);
    expect(nav.querySelector('[data-hds-component="Card"], [class*="Card"]')).toBeNull();
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

  it('first use says no count under the title (no "0 jobs")', () => {
    renderTracker();
    const title = screen.getByRole('heading', { level: 1, name: 'Apply' });
    expect(title.nextElementSibling).toBeNull();
    expect(screen.queryByText('0 jobs')).toBeNull();
  });
});

describe('Pipeline filtered to nothing', () => {
  it('a search with no match: no period, a helper line and Clear search', async () => {
    const user = userEvent.setup();
    addJob('https://acme.example/jobs/1', 'Design Engineer');
    renderList();
    await user.type(screen.getByRole('textbox', { name: 'Search saved jobs' }), 'zzz nothing');
    expect(screen.getByText('No jobs match "zzz nothing"')).toBeInTheDocument();
    expect(screen.getByText('Try a shorter word, or clear the search.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByRole('textbox', { name: 'Search saved jobs' })).toHaveValue('');
    expect(screen.getByRole('link', { name: 'Design Engineer' })).toBeInTheDocument();
  });

  it('a view with no jobs: Try another view, and Show to apply goes back', async () => {
    const user = userEvent.setup();
    addJob('https://acme.example/jobs/1', 'Design Engineer');
    renderList();
    await user.click(screen.getByRole('button', { name: 'Interviewing 0' }));
    expect(screen.getByText('Try another view.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show to apply' }));
    expect(screen.getByRole('button', { name: 'To apply 1' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('nothing left to apply to: a plain title, no em dash', async () => {
    addJob('https://acme.example/jobs/1', 'Design Engineer');
    markAppliedByUrl('https://acme.example/jobs/1', 'Design Engineer');
    renderList();
    expect(screen.getByText('Nothing left to apply to')).toBeInTheDocument();
    expect(screen.getByText('Check Applied, or add more jobs.')).toBeInTheDocument();
  });
});

describe('Sort shows only its value', () => {
  it('the prefix lives in the name, not the visible text', () => {
    addJob('https://acme.example/jobs/1', 'Design Engineer');
    renderList();
    expect(screen.getByRole('button', { name: /^Sort:/ }).textContent).not.toMatch(/^Sort/);
  });
});

// The Pipeline holds no stats or funnel (#128); its agenda is the Follow up section (#236).
describe('Pipeline holds the list only', () => {
  it('has no This week agenda or Insights band', () => {
    addJob('https://acme.example/jobs/1', 'Design Engineer');
    renderList();
    expect(screen.queryByRole('button', { name: /Insights/ })).toBeNull();
    expect(screen.queryByText(/^This week/)).toBeNull();
  });
});
