// To apply's company marks: one per distinct company, three shown, "+N" for every other one.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
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

describe('the agenda keeps up with the clock (#309)', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });
  const applied = {
    url: 'https://acme.example.com/j/1',
    label: 'Acme role',
    title: 'Acme role',
    company: 'Acme',
    status: 'Applied',
    applied: '2026-10-20',
    events: [{ id: 'e', kind: 'call', date: '2026-10-27' }],
  } as Job;
  const followUps = () => screen.getByRole('region', { name: /^Follow up \(/ });
  const nextDays = () => screen.getByRole('region', { name: /^Next 7 days/ });

  it('crossing local midnight turns Tomorrow into Today and the follow-up due', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 26, 23, 59, 30));
    render(<ApplyQueueSummary jobs={[applied]} />);
    expect(followUps()).toHaveTextContent('Follow up Tomorrow');
    expect(nextDays()).toHaveTextContent('Tomorrow, all day');
    expect(within(followUps()).queryByText('Follow-up due')).toBeNull();
    act(() => vi.advanceTimersByTime(60_000));
    expect(within(followUps()).getByText('Follow-up due')).toBeInTheDocument();
    expect(nextDays()).toHaveTextContent('Today, all day');
  });

  it('coming back to the tab reads the clock again', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 26, 12, 0));
    render(<ApplyQueueSummary jobs={[applied]} />);
    expect(nextDays()).toHaveTextContent('Tomorrow, all day');
    // A sleeping laptop: the timer never fired, the clock moved on.
    vi.setSystemTime(new Date(2026, 9, 27, 8, 0));
    act(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(nextDays()).toHaveTextContent('Today, all day');
  });
});
