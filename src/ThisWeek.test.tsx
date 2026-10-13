import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import ThisWeek, { NextUp } from './ThisWeek';
import { addJob, getAllJobs, removeJob, updateJob } from './store';

const A = 'https://example.com/jobs/a';

const view = () => <ThisWeek />;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 14, 10, 0)); // Wed; week Mon 10-12 … Sun 10-18
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  getAllJobs()
    .slice()
    .forEach((j) => removeJob(j.url));
});

describe('ThisWeek', () => {
  it('renders nothing when the week is empty', () => {
    const { container } = render(view());
    expect(container).toBeEmptyDOMElement();
  });

  it('shows an interview this week, grouped by day', () => {
    addJob(A, 'Welder');
    updateJob(A, {
      company: 'Acme',
      events: [{ id: 'e1', kind: 'interview', date: '2026-10-16', time: '14:00' }],
    });
    render(view());
    expect(screen.getByText('This week · 1')).toBeInTheDocument();
    expect(screen.getByText('Fri, Oct 16')).toBeInTheDocument();
    expect(screen.getByText('14:00')).toBeInTheDocument();
    expect(screen.getByText('Interview')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Welder/ })).toHaveAttribute('href', A);
    expect(screen.getByText('Acme')).toBeInTheDocument();
  });

  it('ignores events outside the week', () => {
    addJob(A, 'Welder');
    updateJob(A, { events: [{ id: 'e1', kind: 'call', date: '2026-10-19' }] });
    const { container } = render(view());
    expect(container).toBeEmptyDOMElement();
  });

  it('flags an overdue follow-up with a warning badge', () => {
    addJob(A, 'Welder');
    updateJob(A, { status: 'Applied', applied: '2026-09-20' });
    render(view());
    expect(screen.getByText('Follow up')).toBeInTheDocument();
    expect(screen.getByText('Overdue')).toBeInTheDocument();
    expect(screen.getByText('All day')).toBeInTheDocument();
  });

  it('updates when the store changes', () => {
    addJob(A, 'Welder');
    render(view());
    expect(screen.queryByText(/This week/)).toBeNull();
    act(() => updateJob(A, { events: [{ id: 'e1', kind: 'call', date: '2026-10-15' }] }));
    expect(screen.getByText('This week · 1')).toBeInTheDocument();
  });

  it('has no WCAG A/AA violations', async () => {
    addJob(A, 'Welder');
    updateJob(A, { status: 'Applied', applied: '2026-09-20' });
    const { container } = render(view());
    const results = await axe(container, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    });
    expect(results.violations.map((v) => `${v.id} ×${v.nodes.length}`)).toEqual([]);
  });
});

describe('NextUp', () => {
  it('renders nothing without a tracked follow-up', () => {
    addJob(A, 'Welder');
    const { container } = render(<NextUp />);
    expect(container).toBeEmptyDOMElement();
  });
  it('caps at three, most overdue first', () => {
    for (const [i, d] of ['2026-10-12', '2026-09-01', '2026-10-01', '2026-10-13'].entries()) {
      const u = `https://example.com/jobs/${i}`;
      addJob(u, `Job ${i}`);
      updateJob(u, { status: 'Applied', applied: d });
    }
    render(<NextUp />);
    const links = screen.getAllByRole('link').map((l) => l.textContent);
    expect(links).toEqual(['Job 1', 'Job 2', 'Job 0']);
  });
});
