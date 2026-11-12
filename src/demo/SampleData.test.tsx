import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@hirobius/design-system';
import TrackerView from '../TrackerView';
import { CloudSyncContext, type CloudSyncApi } from '../account/accountContext';
import { addJob, getAllJobs, removeJob } from '../store';
import { openAllJobs } from '../test/allJobs';

// With jobs the tab is the first job's Apply view (Proposal A, Adrian 2026-11-08), which reads sync.
const renderTracker = () =>
  render(
    <CloudSyncContext.Provider value={{ user: null, settled: true } as unknown as CloudSyncApi}>
      <ToastProvider>
        <main>
          <TrackerView />
        </main>
      </ToastProvider>
    </CloudSyncContext.Provider>,
  );

afterEach(() => {
  cleanup();
  getAllJobs()
    .slice()
    .forEach((j) => removeJob(j.url));
  localStorage.clear();
});

// Text queries, not role queries: computing accessible names over 10 cards is slow in jsdom.
const tryButton = () => screen.queryByText(/try with sample data/i);
const banner = () =>
  document.querySelector<HTMLElement>('[role="status"][aria-label="Sample data"]');

describe('Try with sample data (Tracker)', () => {
  it(
    'loads the sample from an empty tracker, then Clear returns it to empty',
    { timeout: 20_000 },
    async () => {
      const user = userEvent.setup();
      renderTracker();
      expect(banner()).toBeNull();

      await user.click(tryButton()!);
      // The tab is now the first job to apply to (Proposal A); the sample line and the list's
      // count are in the All jobs sheet (#543), not on the job page.
      expect(getAllJobs()).toHaveLength(10);
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      expect(banner()).toBeNull();
      const sheet = await openAllJobs();
      expect(banner()).toHaveTextContent(/10 fictional jobs/);
      expect(within(sheet).getByText(/^To apply · \d+ jobs$/)).toBeInTheDocument();
      expect(tryButton()).toBeNull();

      await user.click(within(banner()!).getByRole('button', { name: /clear sample data/i }));
      expect(banner()).toBeNull();
      expect(getAllJobs()).toEqual([]);
      expect(tryButton()).toBeInTheDocument();
    },
  );

  // #345: the pressed control leaves with what it changed; focus goes to the Pipeline heading,
  // never to <body>.
  it('Try with sample data and Clear hand focus to the Pipeline heading', async () => {
    const user = userEvent.setup();
    renderTracker();
    const heading = () => screen.getByRole('heading', { level: 1 });

    await user.click(tryButton()!);
    // The first job's title (Proposal A: the tab is the job).
    await waitFor(() => expect(heading()).toHaveFocus());

    // Clear lives in the All jobs sheet (#543).
    await openAllJobs();
    expect(banner()).toBeInTheDocument();
    await user.click(within(banner()!).getByRole('button', { name: /clear sample data/i }));
    expect(banner()).toBeNull();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Apply' })).toHaveFocus());
  });

  it('is not offered when the tracker already has real jobs', () => {
    addJob('https://boards.greenhouse.io/acme/jobs/7');
    renderTracker();
    expect(tryButton()).toBeNull();
    expect(banner()).toBeNull();
  });

  it('is not offered while a cloud session is stored (sync could merge the sample in)', () => {
    localStorage.setItem('sb-nelrcmbkimjjmfmgnixj-auth-token', '{}');
    renderTracker();
    expect(tryButton()).toBeNull();
  });

  it('keeps the banner (and Clear) up when a search hides every sample row', async () => {
    const user = userEvent.setup();
    renderTracker();
    await user.click(tryButton()!);
    await openAllJobs();
    await user.type(screen.getByPlaceholderText(/search/i), 'zzz-no-match');
    expect(banner()).toBeInTheDocument();
  });

  it('Clear keeps a job the user added on top of the sample', async () => {
    const user = userEvent.setup();
    renderTracker();
    await user.click(tryButton()!);
    addJob('https://boards.greenhouse.io/acme/jobs/8');
    await openAllJobs();
    await user.click(within(banner()!).getByRole('button', { name: /clear sample data/i }));
    expect(getAllJobs().map((j) => j.url)).toEqual(['https://boards.greenhouse.io/acme/jobs/8']);
  });
});
