import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { NextUp } from './NextUp';
import { addJob, getAllJobs, removeJob, updateJob } from './store';

const A = 'https://example.com/jobs/a';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 14, 10, 0));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  getAllJobs()
    .slice()
    .forEach((j) => removeJob(j.url));
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
  it('has no WCAG A/AA violations', async () => {
    addJob(A, 'Welder');
    updateJob(A, { status: 'Applied', applied: '2026-09-01' });
    const { container } = render(<NextUp />);
    const results = await axe(container, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    });
    expect(results.violations.map((v) => `${v.id} ×${v.nodes.length}`)).toEqual([]);
  });
});
