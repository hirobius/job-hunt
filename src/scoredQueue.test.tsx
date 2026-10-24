import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@hirobius/design-system';
import type { User } from '@supabase/supabase-js';
import { CloudSyncContext, type CloudSyncApi } from './account/accountContext';
import type { StoredPosting } from './tracks/postings';

const api = vi.hoisted(() => ({
  loadScoredPostings: vi.fn(),
  skipPosting: vi.fn(),
  unskipPosting: vi.fn(),
}));
vi.mock('./tracks/postings', async (orig) => ({
  ...(await orig<typeof import('./tracks/postings')>()),
  ...api,
}));

import ScoredQueue from './ScoredQueue';
import NoticeHost from './NoticeHost';
import { dismissNotice } from './saveNotice';
import { getAllJobs, replaceAll } from './store';

const row = (id: number, title: string, over: Partial<StoredPosting> = {}): StoredPosting => ({
  id,
  trackSlug: 'design-systems',
  company: 'Stripe',
  title,
  location: 'Remote',
  url: `https://boards.greenhouse.io/stripe/jobs/${id}`,
  score: 90,
  verdict: 'queue',
  reasons: ['title match: /design systems?/'],
  ...over,
});

const sync = (user: User | null): CloudSyncApi =>
  ({ user, settled: true, authResolved: true }) as unknown as CloudSyncApi;
const renderQueue = (user: User | null = { id: 'u1' } as User) =>
  render(
    <ToastProvider>
      <CloudSyncContext.Provider value={sync(user)}>
        <ScoredQueue />
        <NoticeHost />
      </CloudSyncContext.Provider>
    </ToastProvider>,
  );

beforeEach(() => {
  localStorage.clear();
  replaceAll([]);
  api.loadScoredPostings.mockReset().mockResolvedValue({
    rows: [
      row(1, 'Design Systems Engineer', { score: 91, postedAt: '2026-10-01' }),
      row(2, 'Product Designer, Design Systems', { score: 96 }),
      row(3, 'Design Systems Lead', { score: 91, postedAt: '2026-10-20' }),
      row(4, 'Staff Product Designer, Platform', {
        verdict: 'review',
        score: 56,
        reasons: ['adjacent title: /x/', 'held for review: only 1 body signal(s)'],
      }),
      row(5, 'Skipped before', { score: 99 }),
    ],
    skipped: new Set([5]),
  });
  api.skipPosting.mockReset().mockResolvedValue(undefined);
  api.unskipPosting.mockReset().mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  dismissNotice();
});

const titles = () =>
  within(screen.getByRole('list', { name: 'Queued postings' }))
    .getAllByRole('heading', { level: 4 })
    .map((h) => h.textContent?.replace(' (opens in new tab)', ''));

describe('the scored queue on the Pipeline', () => {
  it('shows only queued postings, by score then newest, each with its reasons; skips stay out', async () => {
    renderQueue();
    await screen.findByRole('list', { name: 'Queued postings' });
    expect(titles()).toEqual([
      'Product Designer, Design Systems',
      'Design Systems Lead',
      'Design Systems Engineer',
    ]);
    const cards = within(screen.getByRole('list', { name: 'Queued postings' })).getAllByRole(
      'listitem',
    );
    for (const c of cards)
      expect(within(c).getByText('Queued because: title match: /design systems?/')).toBeVisible();
  });

  it('Review is its own bucket with a count', async () => {
    renderQueue();
    const review = await screen.findByRole('button', { name: /Review/ });
    expect(within(review).getByText('1')).toBeInTheDocument();
    await userEvent.click(review);
    const held = screen.getByRole('list', { name: 'Held for review' });
    expect(within(held).getByText('Staff Product Designer, Platform')).toBeVisible();
    expect(within(held).getByText(/^Held for review because: adjacent title/)).toBeVisible();
  });

  it('Skip writes the posting and its reasons, and Undo takes it back', async () => {
    const user = userEvent.setup();
    renderQueue();
    await screen.findByRole('list', { name: 'Queued postings' });
    await user.click(screen.getByRole('button', { name: 'Skip Design Systems Lead' }));
    expect(api.skipPosting).toHaveBeenCalledWith(
      expect.objectContaining({ id: 3, reasons: ['title match: /design systems?/'] }),
    );
    expect(titles()).not.toContain('Design Systems Lead');
    await user.click(await screen.findByRole('button', { name: 'Undo' }));
    expect(api.unskipPosting).toHaveBeenCalledWith(3);
    await waitFor(() => expect(titles()).toContain('Design Systems Lead'));
  });

  it('Save adds the posting to the Pipeline', async () => {
    renderQueue();
    await screen.findByRole('list', { name: 'Queued postings' });
    await userEvent.click(screen.getByRole('button', { name: 'Save Design Systems Lead' }));
    expect(getAllJobs()[0]).toMatchObject({ label: 'Design Systems Lead', company: 'Stripe' });
    expect(screen.getByRole('button', { name: 'Saved Design Systems Lead' })).toBeDisabled();
  });

  it('shows nothing signed out, or when the tables are not there yet', async () => {
    renderQueue(null);
    expect(api.loadScoredPostings).not.toHaveBeenCalled();
    expect(screen.queryByRole('region', { name: 'Queued postings' })).toBeNull();
    cleanup();
    api.loadScoredPostings.mockRejectedValue(new Error('relation "postings" does not exist'));
    renderQueue();
    await waitFor(() => expect(api.loadScoredPostings).toHaveBeenCalled());
    expect(screen.queryByRole('region', { name: 'Queued postings' })).toBeNull();
  });
});
