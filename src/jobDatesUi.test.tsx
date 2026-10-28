// Job dates on the Pipeline's cards (#419; Adrian 2026-10-28): one date per job ("Posted …", else
// "Found …") plus the closing date as a badge, in the warning tone only within 7 days.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ToastProvider } from '@hirobius/design-system';
import JobListCard from './JobListCard';
import { ymd } from './jobEvents';
import type { Job } from './types';

const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d;
};
const short = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const job = (patch: Partial<Job>): Job => ({
  url: 'https://acme.example/jobs/1',
  label: 'Product Designer',
  status: 'Saved',
  company: 'Acme',
  ...patch,
});
const card = (j: Job) =>
  render(
    <ToastProvider>
      <JobListCard job={j} />
    </ToastProvider>,
  );
const toneOf = (text: string) =>
  screen.getByText(text).closest('[data-tone]')?.getAttribute('data-tone');

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('job card dates', () => {
  it('shows the posted date only, never the saved one', () => {
    card(job({ postedAt: ymd(day(-3)), savedAt: day(-1).toISOString() }));
    expect(screen.getByText('Posted 3d ago')).toBeInTheDocument();
    expect(screen.queryByText(/^Saved \w{3} \d/)).toBeNull(); // the Saved status badge stays
  });

  it('falls back to when it was found', () => {
    card(job({ discoveredAt: day(-2).toISOString() }));
    expect(screen.getByText('Found 2d ago')).toBeInTheDocument();
  });

  it.each([
    ['closes within 7 days: warning', 5, 'warning'],
    ['closes later: neutral', 12, 'neutral'],
  ])('%s', (_name, offset, tone) => {
    const close = day(offset);
    card(job({ deadline: ymd(close) }));
    expect(toneOf(`Closes ${short(close)}`)).toBe(tone);
  });

  it('a job gone from its board says Closed', () => {
    card(job({ closedAt: day(-1).toISOString() }));
    expect(screen.getByText('Closed')).toBeInTheDocument();
  });
});
