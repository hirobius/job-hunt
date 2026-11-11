// The named views (#541): chips with counts, one pressed, its one-line description under them.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import JobViews from './JobViews';
import { addJob, getAllJobs, removeJob, updateJob } from './store';
import { getPipelineView, VIEW_DESCRIPTION } from './pipelineView';

afterEach(() => {
  cleanup();
  getAllJobs()
    .slice()
    .forEach((j) => removeJob(j.url));
});

describe('JobViews (#541)', () => {
  it('shows the five views and All jobs, each with its count, To apply pressed', () => {
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
      'Interviewing 0',
      'Applied 0',
      'Recently closed 1',
      'All jobs 2',
    ]);
    expect(screen.getByRole('button', { name: 'To apply 1' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText(VIEW_DESCRIPTION.toApply)).toBeInTheDocument();
  });

  it('a press opens that view and swaps the description line', async () => {
    addJob('https://a.example/2', 'Gone one');
    updateJob('https://a.example/2', { closedAt: '2026-11-01T00:00:00Z' });
    render(<JobViews />);
    await userEvent.click(screen.getByRole('button', { name: 'Recently closed 1' }));
    expect(getPipelineView().filter).toBe('closed');
    expect(screen.getByRole('button', { name: 'Recently closed 1' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText(VIEW_DESCRIPTION.closed)).toBeInTheDocument();
    expect(screen.queryByText(VIEW_DESCRIPTION.toApply)).toBeNull();
  });
});
