// The named views (#541): chips with counts, one pressed; no description line since 2026-11-13.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import JobViews from './JobViews';
import { addJob, getAllJobs, removeJob, updateJob } from './store';
import { getPipelineView } from './pipelineView';
import { decided } from './decided';
import { act } from '@testing-library/react';

afterEach(() => {
  cleanup();
  localStorage.removeItem('rjb_decided');
  getAllJobs()
    .slice()
    .forEach((j) => removeJob(j.url));
});

describe('JobViews (#541)', () => {
  it('shows the seven views and All jobs, each with its count, To apply pressed', () => {
    addJob('https://a.example/1', 'Saved one');
    addJob('https://a.example/2', 'Gone one');
    updateJob('https://a.example/2', { closedAt: '2026-11-01T00:00:00Z' });
    render(<JobViews />);
    const names = within(screen.getByRole('group', { name: 'Views' }))
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label'));
    expect(names).toEqual([
      'To apply 1',
      'Follow up 0',
      'This week 0',
      'Interviewing 0',
      'Applied 0',
      'Recently closed 1',
      'Passed 0',
      'All jobs 2',
    ]);
    expect(screen.getByRole('button', { name: 'To apply 1' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.queryByText(/Every saved job/)).toBeNull();
  });

  it('Passed counts set-aside jobs and skipped postings, not hidden ones', () => {
    addJob('https://a.example/3', 'Not a fit one');
    updateJob('https://a.example/3', { archived: true });
    act(() => {
      decided.set('fp-1', 'skipped', undefined, { title: 'Skipped one' });
      decided.set('fp-2', 'skipped');
      decided.set('fp-3', 'saved');
    });
    act(() => void decided.hide('fp-2'));
    render(<JobViews />);
    expect(screen.getByRole('button', { name: 'Passed 2' })).toBeInTheDocument();
  });

  it('a press opens that view', async () => {
    addJob('https://a.example/2', 'Gone one');
    updateJob('https://a.example/2', { closedAt: '2026-11-01T00:00:00Z' });
    render(<JobViews />);
    await userEvent.click(screen.getByRole('button', { name: 'Recently closed 1' }));
    expect(getPipelineView().filter).toBe('closed');
    expect(screen.getByRole('button', { name: 'Recently closed 1' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
