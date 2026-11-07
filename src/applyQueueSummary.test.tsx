// The Apply list's agenda: Follow up and Next 7 days keep up with the clock (#309, #311).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import ApplyQueueSummary from './ApplyQueueSummary';
import type { Job } from './types';

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

  it('a call that ends while the tab is open leaves Next 7 days then (#311)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 27, 13, 50));
    const call = {
      ...applied,
      events: [{ id: 'c', kind: 'call', date: '2026-10-27', time: '13:00', durationMin: 60 }],
    } as Job;
    render(<ApplyQueueSummary jobs={[call]} />);
    expect(nextDays()).toHaveTextContent('Today, 1:00 PM');
    act(() => vi.advanceTimersByTime(10 * 60_000));
    expect(screen.queryByRole('region', { name: /^Next 7 days/ })).toBeNull();
  });

  it('a call running past midnight does not hold back the midnight tick', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 26, 23, 50));
    const late = {
      ...applied,
      events: [
        { id: 'l', kind: 'call', date: '2026-10-26', time: '23:30', durationMin: 60 },
        { id: 'e', kind: 'call', date: '2026-10-27' },
      ],
    } as Job;
    render(<ApplyQueueSummary jobs={[late]} />);
    expect(nextDays()).toHaveTextContent('Tomorrow, all day');
    act(() => vi.advanceTimersByTime(11 * 60_000));
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
