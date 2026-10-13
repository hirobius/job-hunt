import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TrackerView from './TrackerView';
import { DataToolsContext, type DataToolsApi } from './account/accountContext';
import { addJob, getAllJobs, removeJob, updateJob } from './store';

const tools: DataToolsApi = {
  backup: vi.fn(),
  chooseRestore: vi.fn(),
  exportCsv: vi.fn(),
  canExport: true,
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 14, 10, 0));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
  getAllJobs()
    .slice()
    .forEach((j) => removeJob(j.url));
});

const renderTracker = () =>
  render(
    <DataToolsContext.Provider value={tools}>
      <TrackerView />
    </DataToolsContext.Provider>,
  );

const A = 'https://example.com/jobs/a';
const B = 'https://example.com/jobs/b';

describe('TrackerView', () => {
  it('adds a pasted job URL to the queue', async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    renderTracker();
    await user.type(screen.getByLabelText(/job url/i), 'https://boards.greenhouse.io/acme/jobs/42');
    await user.click(screen.getByRole('button', { name: /^add$/i }));
    expect(await screen.findByRole('link', { name: /boards/i })).toBeInTheDocument();
  });

  it('first use shows the add bar and empty state, no filters or toolbar', () => {
    renderTracker();
    expect(screen.getByLabelText(/job url/i)).toBeInTheDocument();
    expect(screen.getByText('Your tracker is empty')).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: /filter jobs/i })).toBeNull();
    expect(screen.queryByLabelText(/search saved jobs/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /^sort/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /your data/i })).toBeNull();
  });

  it('shows filters, search, sort and data once a job exists', () => {
    addJob(A, 'Welder');
    renderTracker();
    expect(screen.getByRole('radiogroup', { name: /filter jobs/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/search saved jobs/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^sort/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /your data/i })).toBeInTheDocument();
  });

  it('lists due follow-ups under Next up, linking to the job page', () => {
    addJob(A, 'Welder');
    updateJob(A, { status: 'Applied', applied: '2026-09-20', priority: true });
    addJob(B, 'Fitter');
    renderTracker();
    const next = screen.getByRole('region', { name: 'Next up' });
    expect(within(next).getByRole('link', { name: 'Welder' })).toHaveAttribute(
      'href',
      expect.stringContaining('#/queue/'),
    );
    expect(within(next).getByText('Overdue')).toBeInTheDocument();
    expect(within(next).queryByText('Fitter')).toBeNull();
  });

  it('hides Next up while searching and leaves no pipeline or funnel module', async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    addJob(A, 'Welder');
    updateJob(A, { status: 'Applied', applied: '2020-01-01', priority: true });
    renderTracker();
    expect(screen.queryByText(/pipeline/i)).toBeNull();
    expect(screen.queryByText(/funnel/i)).toBeNull();
    expect(screen.getByRole('region', { name: 'Next up' })).toBeInTheDocument();
    await user.type(screen.getByLabelText(/search saved jobs/i), 'wel');
    expect(screen.queryByRole('region', { name: 'Next up' })).toBeNull();
  });

  it('data sheet offers Back up, Restore and Export CSV', async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    addJob(A, 'Welder');
    renderTracker();
    await user.click(screen.getByRole('button', { name: /your data/i }));
    expect(screen.getByRole('button', { name: /restore/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export csv/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /back up/i }));
    expect(tools.backup).toHaveBeenCalled();
  });
});
