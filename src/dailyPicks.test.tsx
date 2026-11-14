// Daily picks on Today (2026-11-05): each pick shows its fit line and drafted note (Copy), and
// Save → Pipeline like any posting, with the draft note in the Job's Notes. Driven by role + name.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@hirobius/design-system';
import DailyPicks from './DailyPicks';
import NoticeHost from './NoticeHost';
import { dismissNotice } from './saveNotice';
import { getAllJobs, replaceAll } from './store';
import { replaceDecided } from './decided';
import { pickFromRow, type DailyPick } from './picks';

const pick = (o: Record<string, unknown>): DailyPick =>
  pickFromRow({
    id: 1,
    picked_on: '2026-11-04',
    company: 'Onward Search',
    title: 'Design Systems Designer',
    employment: 'contract',
    pay: '$75–$90/hr',
    posted_on: null,
    url: 'https://onwardsearch.com/jobs/1',
    why: 'Best pay found, remote US-only contract.',
    note: 'Hi, I would like to be considered for the remote contract.',
    ...o,
  })!;

const PICKS = [
  pick({}),
  pick({
    id: 2,
    company: 'ClickHouse',
    title: 'Design Systems Engineer',
    employment: 'employee',
    pay: '',
    posted_on: '2026-11-03',
    url: 'https://clickhouse.com/careers/ds',
    why: 'Title is exactly his lane.',
    note: 'Hi, the Design Systems Engineer role stood out.',
  }),
];

const renderPicks = (picks: DailyPick[] = PICKS) =>
  render(
    <ToastProvider>
      <DailyPicks load={() => Promise.resolve(picks)} />
      <NoticeHost />
    </ToastProvider>,
  );

beforeEach(() => {
  localStorage.clear();
  replaceAll([]);
  replaceDecided([]);
  dismissNotice();
});
afterEach(cleanup);

const panel = () => screen.findByRole('region', { name: /Daily picks/ });
const row = (name: string) => screen.getByRole('listitem', { name });

describe('Daily picks', () => {
  it('lists each pick with its link, kind, pay, posted day and fit line', async () => {
    renderPicks();
    const p = await panel();
    expect(within(p).getByRole('heading', { name: 'Daily picks' })).toBeTruthy();
    const a = within(p).getByRole('listitem', { name: 'Design Systems Designer at Onward Search' });
    expect(
      within(a)
        .getByRole('link', { name: /Design Systems Designer/ })
        .getAttribute('href'),
    ).toBe('https://onwardsearch.com/jobs/1');
    expect(within(a).getByText('Contract')).toBeTruthy();
    // One fact per line (#616; HDS Card.Facts, stacked since 0.43): pay, then the posted day.
    expect(within(a).getByText('$75–$90/hr').closest('li')).toBeTruthy();
    expect(within(a).getByText('Posted date not found').closest('li')).toBeTruthy();
    expect(within(a).getByText('Best pay found, remote US-only contract.')).toBeTruthy();
    const b = row('Design Systems Engineer at ClickHouse');
    expect(within(b).getByText('Employee')).toBeTruthy();
    expect(within(b).getByText('Pay not found').closest('li')).toBeTruthy();
    expect(within(b).getByText('Posted Nov 3').closest('li')).toBeTruthy();
  });

  it('opens the draft note and copies it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderPicks();
    await panel();
    const a = row('Design Systems Designer at Onward Search');
    await userEvent.click(within(a).getByRole('button', { name: /Draft note/ }));
    expect(within(a).getAllByText(/I would like to be considered/).length).toBeGreaterThan(0);
    await userEvent.click(
      within(a).getByRole('button', {
        name: 'Copy note for Design Systems Designer at Onward Search',
      }),
    );
    expect(writeText).toHaveBeenCalledWith(
      'Hi, I would like to be considered for the remote contract.',
    );
    expect(await screen.findByText('Copied the note')).toBeTruthy();
  });

  it('Save puts the job in the Pipeline with the draft note in its Notes, and the pick leaves', async () => {
    renderPicks();
    await panel();
    await userEvent.click(
      screen.getByRole('button', { name: 'Save Design Systems Designer at Onward Search' }),
    );
    const [job] = getAllJobs();
    expect(job).toMatchObject({
      url: 'https://onwardsearch.com/jobs/1',
      label: 'Design Systems Designer',
      company: 'Onward Search',
      salary: '$75–$90/hr',
      status: 'Saved',
    });
    expect(job.notes).toContain(
      'Draft note to the hiring manager:\nHi, I would like to be considered',
    );
    expect(job.notes).toContain('Why it fits: Best pay found');
    expect(await screen.findByText(/^Added to Apply/)).toBeTruthy();
    expect(
      screen.queryByRole('listitem', { name: 'Design Systems Designer at Onward Search' }),
    ).toBeNull();
  });

  it('Skip hides the pick, and Undo brings it back', async () => {
    renderPicks();
    await panel();
    await userEvent.click(
      screen.getByRole('button', { name: 'Skip Design Systems Engineer at ClickHouse' }),
    );
    expect(
      screen.queryByRole('listitem', { name: 'Design Systems Engineer at ClickHouse' }),
    ).toBeNull();
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(row('Design Systems Engineer at ClickHouse')).toBeTruthy());
  });

  it('hides when there is nothing to show, or the read fails', async () => {
    const { container } = renderPicks([]);
    await new Promise((r) => setTimeout(r, 0));
    expect(within(container).queryByRole('region', { name: /Daily picks/ })).toBeNull();
    cleanup();
    render(
      <ToastProvider>
        <DailyPicks load={() => Promise.reject(new Error('relation does not exist'))} />
      </ToastProvider>,
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole('region', { name: /Daily picks/ })).toBeNull();
  });
});
