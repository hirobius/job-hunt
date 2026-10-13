import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { ToastProvider } from '@hirobius/design-system';
import { PipelineStats } from './PipelineStats';
import type { Job } from './types';

const pad = (n: number) => (n < 10 ? '0' : '') + n;
const ago = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
let n = 0;
const job = (o: Partial<Job>): Job => ({
  url: `https://x.co/${n++}`,
  label: 'x',
  status: 'Saved',
  ...o,
});

const seeded: Job[] = [
  job({ status: 'Applied', applied: ago(1) }),
  job({ status: 'Applied', applied: ago(10) }),
  job({
    status: 'Interviewing',
    applied: ago(5),
    history: [
      { status: 'Applied', at: ago(5) },
      { status: 'Interviewing', at: ago(3) },
    ],
  }),
  job({ status: 'Saved' }),
];

const wrap = (jobs: Job[]) =>
  render(
    <ToastProvider>
      <PipelineStats jobs={jobs} />
    </ToastProvider>,
  );

afterEach(cleanup);

describe('PipelineStats', () => {
  it('renders nothing when no job has been applied to', () => {
    const { container } = wrap([job({}), job({ status: 'Saved' })]);
    expect(container.textContent).toBe('');
  });

  it('renders the stat band and 8 bars for seeded jobs', () => {
    wrap(seeded);
    expect(screen.getByText('Applied 7d')).toBeTruthy();
    expect(screen.getByText('Applied 30d')).toBeTruthy();
    expect(screen.getByText('Response rate')).toBeTruthy();
    expect(screen.getAllByText('33%')).toHaveLength(2);
    expect(screen.getByText('Median reply')).toBeTruthy();
    expect(screen.getAllByTestId('week-bar')).toHaveLength(8);
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/last 8 weeks/);
  });

  it('shows a dash for an unavailable median', () => {
    wrap([job({ status: 'Applied', applied: ago(1) })]);
    expect(screen.getAllByText('0%').length).toBe(2);
    expect(screen.getByText('—')).toBeTruthy();
  });

  it('has no axe violations', async () => {
    const { container } = wrap(seeded);
    const results = await axe(container, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    });
    expect(results.violations.map((v) => `${v.id} ×${v.nodes.length}`)).toEqual([]);
  });
});
