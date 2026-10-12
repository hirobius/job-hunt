import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TrackerView from '../TrackerView';
import { addJob, getAllJobs, removeJob } from '../store';

afterEach(() => {
  cleanup();
  getAllJobs()
    .slice()
    .forEach((j) => removeJob(j.url));
  localStorage.clear();
});

const tryButton = () => screen.queryByRole('button', { name: /try with sample data/i });
const banner = () => screen.queryByRole('status', { name: /sample data/i });

describe('Try with sample data (Tracker)', () => {
  it('loads the sample from an empty tracker, then Clear returns it to empty', async () => {
    const user = userEvent.setup();
    render(<TrackerView />);
    expect(banner()).toBeNull();

    await user.click(tryButton()!);
    expect(banner()).toHaveTextContent(/10 fictional jobs/);
    // Saved jobs + the pinned follow-ups/interviews show in the default Active view.
    expect(screen.getByText('Solutions Engineer')).toBeInTheDocument();
    expect(screen.getByText('Clinical Systems Analyst')).toBeInTheDocument();
    expect(screen.getByText('UX Researcher')).toBeInTheDocument();
    expect(tryButton()).toBeNull();

    await user.click(within(banner()!).getByRole('button', { name: /clear sample data/i }));
    expect(banner()).toBeNull();
    expect(getAllJobs()).toEqual([]);
    expect(tryButton()).toBeInTheDocument();
  });

  it('is not offered when the tracker already has real jobs', () => {
    addJob('https://boards.greenhouse.io/acme/jobs/7');
    render(<TrackerView />);
    expect(tryButton()).toBeNull();
    expect(banner()).toBeNull();
  });

  it('is not offered while a cloud session is stored (sync could merge the sample in)', () => {
    localStorage.setItem('sb-nelrcmbkimjjmfmgnixj-auth-token', '{}');
    render(<TrackerView />);
    expect(tryButton()).toBeNull();
  });

  it('keeps the banner (and Clear) up when a search hides every sample row', async () => {
    const user = userEvent.setup();
    render(<TrackerView />);
    await user.click(tryButton()!);
    await user.type(screen.getByPlaceholderText(/search/i), 'zzz-no-match');
    expect(banner()).toBeInTheDocument();
  });

  it('Clear keeps a job the user added on top of the sample', async () => {
    const user = userEvent.setup();
    render(<TrackerView />);
    await user.click(tryButton()!);
    addJob('https://boards.greenhouse.io/acme/jobs/8');
    await user.click(within(banner()!).getByRole('button', { name: /clear sample data/i }));
    expect(getAllJobs().map((j) => j.url)).toEqual(['https://boards.greenhouse.io/acme/jobs/8']);
  });
});
