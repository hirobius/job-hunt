import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { addJob, getAllJobs, removeJob, updateJob, useJobs } from './store';
import { CloudSyncContext, type CloudSyncApi } from './account/accountContext';
import JobRow from './JobRow';
import JobDetailPage from './JobDetailPage';
import { jobHref } from './jobRoute';
import type { Job } from './types';

afterEach(cleanup);

const job = (extra: Partial<Job> = {}): Job =>
  ({
    url: 'https://boards.greenhouse.io/acme/jobs/42',
    label: 'Design Systems Lead',
    company: 'Acme',
    location: 'Portland, OR',
    status: 'Saved',
    addedAt: Date.now(),
    verdict: 'match',
    mode: 'hybrid',
    note: 'secret note',
    salary: '$150k',
    ...extra,
  }) as Job;

describe('JobRow (rest state)', () => {
  it('shows only identity, status and the next action', () => {
    render(<JobRow job={job()} />);
    expect(screen.getByRole('link', { name: 'Design Systems Lead' })).toHaveAttribute(
      'href',
      jobHref('https://boards.greenhouse.io/acme/jobs/42'),
    );
    expect(screen.getByText('Acme — Portland, OR')).toBeInTheDocument();
    expect(screen.getByText('Saved')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark applied' })).toBeInTheDocument();
  });
  it('leaves screening, notes, salary and templates for the job page', () => {
    render(<JobRow job={job()} />);
    expect(screen.queryByText(/match/i)).toBeNull();
    expect(screen.queryByText(/secret note/)).toBeNull();
    expect(screen.queryByText('$150k')).toBeNull();
    expect(screen.queryByRole('button', { name: /details|use template/i })).toBeNull();
  });
  const today = new Date().toISOString().slice(0, 10);
  it.each([
    ['Saved', {}, 'Mark applied'],
    ['Applied', { applied: '2020-01-01' }, 'Log follow-up'],
    ['Applied', { applied: today }, 'Log follow-up'],
    ['Interviewing', { applied: today }, 'Add interview'],
    ['Rejected', {}, 'Reopen'],
  ] as const)('%s card primary button reads %s', (status, extra, label) => {
    render(<JobRow job={job({ status, ...extra } as Partial<Job>)} />);
    expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
  });
  it('shows a next-step pill when the follow-up is due', () => {
    render(<JobRow job={job({ status: 'Applied', applied: '2020-01-01' } as Partial<Job>)} />);
    expect(screen.getByText('Follow-up due')).toBeInTheDocument();
  });
  it('the row sheet is titled with the job and lists every action', async () => {
    const user = userEvent.setup();
    render(<JobRow job={job()} />);
    await user.click(screen.getByRole('button', { name: 'Actions for Design Systems Lead' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Design Systems Lead');
    expect(dialog).toHaveTextContent('Acme — Portland, OR');
    for (const name of [
      'Open job page',
      'Open posting',
      'Pin as priority',
      'Find more like this',
      'Archive',
      'Remove',
    ])
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
  });
});

describe('JobDetailPage', () => {
  const URL_ = 'https://boards.greenhouse.io/acme/jobs/42';
  const current = () => getAllJobs().find((j) => j.url === URL_)!;
  const signIn = vi.fn();
  const api = { setSignInOpen: signIn } as unknown as CloudSyncApi;

  function Page({ url = URL_ }: { url?: string }) {
    const jobs = useJobs();
    return (
      <CloudSyncContext.Provider value={api}>
        <JobDetailPage job={jobs.find((j) => j.url === url)} />
      </CloudSyncContext.Provider>
    );
  }
  const seed = (extra: Partial<Job> = {}) => {
    addJob(URL_, 'Design Systems Lead');
    updateJob(URL_, { company: 'Acme', location: 'Portland, OR', ...extra });
  };
  const dialog = () => screen.getByRole('dialog');

  beforeEach(() => signIn.mockClear());
  afterEach(() =>
    getAllJobs()
      .slice()
      .forEach((j) => removeJob(j.url)),
  );

  it('shows the header, the next card and the three rows', () => {
    seed({ salary: '$150k', mode: 'hybrid', verdict: 'match', contact: 'Sam' });
    render(<Page />);
    expect(screen.getByRole('heading', { name: 'Design Systems Lead' })).toBeInTheDocument();
    expect(screen.getByText('Acme — Portland, OR')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /view posting — boards\.greenhouse\.io/i }),
    ).toHaveAttribute('href', URL_);
    expect(screen.getByRole('button', { name: 'Mark applied' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use a template' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^To-dos/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Interviews.*None scheduled/ })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^Details.*Match — Hybrid — Sam/ }),
    ).toBeInTheDocument();
    for (const r of ['Glassdoor', 'LinkedIn', 'levels.fyi', 'Google'])
      expect(screen.getByRole('link', { name: r })).toBeInTheDocument();
  });

  it('the primary button marks a Saved job applied', async () => {
    seed();
    render(<Page />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Mark applied' }));
    expect(current().status).toBe('Applied');
  });

  it('the status sheet sets the status, and Closed archives', async () => {
    const user = userEvent.setup();
    seed();
    render(<Page />);
    await user.click(screen.getByRole('button', { name: /change status/i }));
    await user.click(within(dialog()).getByRole('button', { name: 'Interviewing' }));
    expect(current().status).toBe('Interviewing');
    expect(screen.queryByRole('dialog')).toBeNull();

    await user.click(screen.getByRole('button', { name: /change status/i }));
    await user.click(within(dialog()).getByRole('button', { name: 'Closed' }));
    expect(current().archived).toBe(true);
    // A closed job offers Reopen: it un-archives and keeps where the job had got to.
    await user.click(screen.getByRole('button', { name: 'Reopen' }));
    expect(current().archived).toBeFalsy();
    expect(current().status).toBe('Interviewing');

    // A rejected job reopens back to Saved.
    await user.click(screen.getByRole('button', { name: /change status/i }));
    await user.click(within(dialog()).getByRole('button', { name: 'Rejected' }));
    await user.click(screen.getByRole('button', { name: 'Reopen' }));
    expect(current().status).toBe('Saved');
  });

  it('Log follow-up opens a sheet; saving logs it and appends the note', async () => {
    const user = userEvent.setup();
    seed({
      status: 'Applied',
      applied: '2020-01-01',
      followUp: '2020-01-01',
      notes: 'Earlier note',
    });
    render(<Page />);
    await user.click(screen.getByRole('button', { name: 'Log follow-up' }));
    const d = within(dialog());
    await user.click(d.getByRole('radio', { name: 'Called' }));
    await user.type(d.getByLabelText(/note/i), 'left a voicemail');
    await user.click(d.getByRole('button', { name: 'Log follow-up' }));
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    expect(current().followUp).toBe(iso);
    expect(current().notes).toBe(`Earlier note\n${iso} follow-up (Called): left a voicemail`);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Details edits a draft: Cancel discards, Save writes', async () => {
    const user = userEvent.setup();
    seed();
    render(<Page />);
    await user.click(screen.getByRole('button', { name: /^Details/ }));
    await user.clear(within(dialog()).getByLabelText('Company'));
    await user.type(within(dialog()).getByLabelText('Company'), 'Globex');
    await user.click(within(dialog()).getByRole('radio', { name: 'Stretch' }));
    expect(current().company).toBe('Acme');
    await user.click(within(dialog()).getByRole('button', { name: 'Cancel' }));
    expect(current().company).toBe('Acme');
    expect(current().verdict).toBeUndefined();

    await user.click(screen.getByRole('button', { name: /^Details/ }));
    expect(within(dialog()).getByLabelText('Company')).toHaveValue('Acme');
    await user.clear(within(dialog()).getByLabelText('Company'));
    await user.type(within(dialog()).getByLabelText('Company'), 'Globex');
    await user.click(within(dialog()).getByRole('radio', { name: 'Stretch' }));
    await user.click(within(dialog()).getByRole('button', { name: 'Save' }));
    expect(current().company).toBe('Globex');
    expect(current().verdict).toBe('stretch');
  });

  it('shows one notes field, falling back to the legacy note and saving to notes', async () => {
    const user = userEvent.setup();
    seed({ note: 'secret note' });
    render(<Page />);
    await user.click(screen.getByRole('button', { name: /^To-dos/ }));
    const notes = within(dialog()).getByLabelText('Notes');
    expect(notes).toHaveValue('secret note');
    await user.type(notes, '!');
    expect(current().notes).toBe('secret note!');
  });

  it('the Interviews row opens the add form', async () => {
    const user = userEvent.setup();
    seed();
    render(<Page />);
    await user.click(screen.getByRole('button', { name: /^Interviews/ }));
    await user.type(within(dialog()).getByLabelText('Event date'), '2099-01-02');
    await user.click(within(dialog()).getByRole('button', { name: 'Add event' }));
    expect(current().events?.[0]).toEqual(expect.objectContaining({ date: '2099-01-02' }));
  });

  it('explains a missing job, with a way back and a way to sign in', async () => {
    const user = userEvent.setup();
    render(<Page url="https://nope.test/x" />);
    expect(screen.getByText(/isn't in your tracker/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back to tracker/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /sign in to sync/i }));
    expect(signIn).toHaveBeenCalledWith(true);
  });
});
