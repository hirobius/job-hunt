import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Menu, ToastProvider } from '@hirobius/design-system';
import AccountMenuRows from '../account/AccountMenuRows';
import TrackerView from '../TrackerView';
import { CloudSyncContext, type CloudSyncApi } from '../account/accountContext';
import { addJob, getAllJobs, removeJob } from '../store';

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
// The sample line is gone from the Apply list (2026-11-13): Clear is the Account menu's.
const banner = () =>
  document.querySelector<HTMLElement>('[role="status"][aria-label="Sample data"]');

const noop = () => {};
const renderMenu = () =>
  render(
    <CloudSyncContext.Provider value={{ user: null, settled: true } as unknown as CloudSyncApi}>
      <Menu open>
        <Menu.Trigger>Account</Menu.Trigger>
        <Menu.Content>
          <AccountMenuRows
            opensDialog={(f) => f}
            openProfile={noop}
            openCompanies={noop}
            openData={noop}
          />
        </Menu.Content>
      </Menu>
    </CloudSyncContext.Provider>,
  );
const clearItem = () => screen.queryByRole('menuitem', { name: 'Clear sample data' });

describe('Try with sample data (Tracker)', () => {
  it('loads the sample from an empty tracker, with no sample line on Apply', async () => {
    const user = userEvent.setup();
    renderTracker();
    await user.click(tryButton()!);
    expect(getAllJobs()).toHaveLength(10);
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(banner()).toBeNull();
    expect(tryButton()).toBeNull();
  });

  // #345: the pressed control leaves with what it changed; focus goes to the page heading.
  it('Try with sample data hands focus to the page heading', async () => {
    const user = userEvent.setup();
    renderTracker();
    await user.click(tryButton()!);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveFocus());
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
});

describe('Clear sample data (Account menu, 2026-11-13)', () => {
  it('shows only while sample jobs exist, and clears only them', async () => {
    addJob('https://boards.greenhouse.io/acme/jobs/9');
    const { unmount } = renderMenu();
    expect(screen.getByRole('menuitem', { name: 'Documents' })).toBeInTheDocument();
    expect(clearItem()).toBeNull();
    unmount();
    act(() => removeJob('https://boards.greenhouse.io/acme/jobs/9'));
    const { loadSample } = await import('./loadSample');
    act(() => void loadSample());
    addJob('https://boards.greenhouse.io/acme/jobs/8');
    renderMenu();
    act(() => clearItem()!.click());
    expect(getAllJobs().map((j) => j.url)).toEqual(['https://boards.greenhouse.io/acme/jobs/8']);
    expect(clearItem()).toBeNull();
  });
});
