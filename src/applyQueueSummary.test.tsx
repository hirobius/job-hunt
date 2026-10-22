// To apply's company marks: one per distinct company, three shown, "+N" for every other one.
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import ApplyQueueSummary from './ApplyQueueSummary';
import type { Job } from './types';

const job = (n: number, company: string): Job =>
  ({
    url: `https://co${n}.example.com/j/${n}`,
    title: `Role ${n}`,
    label: `Role ${n}`,
    company,
    status: 'Saved',
  }) as Job;

describe('ApplyQueueSummary company marks', () => {
  it('counts every distinct company, not just the first dozen', () => {
    const jobs = Array.from({ length: 15 }, (_, i) => job(i, `Company ${i}`));
    jobs.push(job(99, 'company 3'));
    render(<ApplyQueueSummary jobs={jobs} />);
    expect(screen.getByText('+12')).toBeInTheDocument();
  });
});
