import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  it('shows the full record for a job', () => {
    render(<JobDetailPage job={job()} />);
    expect(screen.getByRole('heading', { name: 'Design Systems Lead' })).toBeInTheDocument();
    // Salary shows in the facts; its edit field sits behind "Edit details & screening".
    expect(screen.getAllByText('$150k').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Job note')).toHaveValue('secret note');
    expect(screen.getByRole('link', { name: /open posting/i })).toHaveAttribute(
      'href',
      'https://boards.greenhouse.io/acme/jobs/42',
    );
  });
  it('explains a missing job and offers a way back', () => {
    render(<JobDetailPage job={undefined} />);
    expect(screen.getByText(/isn't in your tracker/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back to tracker/i })).toBeInTheDocument();
  });
});
