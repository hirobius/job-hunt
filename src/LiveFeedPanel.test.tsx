import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@hirobius/design-system';
import { axe } from 'vitest-axe';
import type { FeedResult } from './feed/fetchFeed';

// The curation store builds a Supabase client at import time — stub it (no network in tests).
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getSession: async () => ({ data: { session: null } }) },
    from: () => ({
      upsert: async () => ({ error: null }),
      delete: () => ({ eq: async () => ({ error: null }) }),
    }),
  }),
}));

const feed = vi.hoisted(() => ({ fetchFeed: vi.fn() }));
vi.mock('./feed/fetchFeed', () => feed);

import LiveFeedPanel from './LiveFeedPanel';
import { STARTER_DIRECTORY } from './radar/directory';
import { getAllJobs, removeJob } from './store';
import { addCategory, getCurationState, replaceCurationState } from './curation/curationStore';
import { EMPTY_CURATION } from './curation/types';

const RESULT: FeedResult = {
  postings: [
    {
      id: 'ashby:ramp:1',
      source: 'ashby',
      title: 'Design Systems Lead',
      company: 'Ramp',
      url: 'https://jobs.ashbyhq.com/ramp/1',
      location: 'New York, NY',
      mode: 'hybrid',
      text: 'Lead the design system.',
    },
    {
      id: 'hn:2',
      source: 'hn',
      title: 'UX/UI Designer (1099 CONTRACT)',
      company: '',
      url: 'https://news.ycombinator.com/item?id=2',
      location: '',
      text: 'Ongoing contract on one design system.',
    },
    {
      id: 'hn:3',
      source: 'hn',
      title: 'Backend Engineer',
      company: 'Nope',
      url: 'https://news.ycombinator.com/item?id=3',
      location: '',
      text: 'Postgres only.',
    },
  ],
  sources: [
    { key: 'hn', label: 'Hacker News', fetched: 2 },
    {
      key: 'remotive',
      label: 'Remotive',
      fetched: 0,
      error: 'Remotive: rate-limited — try again in a few minutes.',
    },
  ],
  boardsSkipped: 0,
};

let cat: string;
beforeEach(() => {
  feed.fetchFeed.mockReset().mockResolvedValue(RESULT);
  replaceCurationState(EMPTY_CURATION);
  cat = addCategory({ label: 'Design Systems' });
});
afterEach(() => {
  cleanup();
  getAllJobs()
    .slice()
    .forEach((j) => removeJob(j.url));
});

const renderPanel = (boardUrls: string[] = []) =>
  render(
    <ToastProvider>
      <LiveFeedPanel
        categoryId={cat}
        terms={['design systems', 'design engineer']}
        boardUrls={boardUrls}
        where=""
        mode="any"
        onWhere={() => {}}
        onMode={() => {}}
      />
    </ToastProvider>,
  );

describe('LiveFeedPanel', () => {
  it('searches the first track term on open and lists only matching postings', async () => {
    renderPanel(['https://jobs.ashbyhq.com/ramp']);
    const list = await screen.findByRole('list', { name: /live postings/i });
    expect(feed.fetchFeed).toHaveBeenCalledWith({
      term: 'design systems',
      boardUrls: ['https://jobs.ashbyhq.com/ramp', ...STARTER_DIRECTORY],
    });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    const hn = rows.find((r) => r.textContent?.includes('UX/UI Designer'))!;
    expect(hn).toHaveTextContent('Contract-friendly');
    expect(hn).toHaveTextContent('In description');
    expect(screen.queryByText('Backend Engineer')).not.toBeInTheDocument();
  });

  it('has no WCAG A/AA violations with results and a source warning showing', async () => {
    const { container } = renderPanel();
    await screen.findByRole('list', { name: /live postings/i });
    const results = await axe(container, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    });
    expect(results.violations.map((v) => `${v.id} ×${v.nodes.length}`)).toEqual([]);
  });

  it('names the source that failed', async () => {
    renderPanel();
    expect(await screen.findByText(/Remotive: rate-limited/)).toBeInTheDocument();
  });

  it('renders "couldn\'t reach any source" empty state when every source fails', async () => {
    feed.fetchFeed.mockResolvedValueOnce({
      postings: [],
      sources: [
        {
          key: 'hn',
          label: 'Hacker News',
          fetched: 0,
          error: 'Hacker News: timed out — try again later.',
        },
        {
          key: 'remotive',
          label: 'Remotive',
          fetched: 0,
          error: 'Remotive: timed out — try again later.',
        },
      ],
      boardsSkipped: 0,
    });
    renderPanel();
    expect(await screen.findByText("Couldn't reach any source")).toBeInTheDocument();
    expect(screen.queryByText(/No live openings mention/)).not.toBeInTheDocument();
  });

  it('filters to contract-friendly openings', async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByRole('list', { name: /live postings/i });
    await user.click(screen.getByRole('radio', { name: /contract-friendly \(1\)/i }));
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('saves a posting to the tracker with its details', async () => {
    const user = userEvent.setup();
    renderPanel();
    const list = await screen.findByRole('list', { name: /live postings/i });
    const ramp = within(list).getByText('Design Systems Lead').closest('li')!;
    await user.click(within(ramp).getByRole('button', { name: 'Save' }));
    expect(getAllJobs()).toEqual([
      expect.objectContaining({
        url: 'https://jobs.ashbyhq.com/ramp/1',
        label: 'Design Systems Lead',
        company: 'Ramp',
        mode: 'hybrid',
        status: 'Saved',
      }),
    ]);
    expect(within(ramp).getByRole('button', { name: 'Saved' })).toBeDisabled();
  });

  it('searches a term chip when clicked', async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByRole('list', { name: /live postings/i });
    await user.click(screen.getByText('design engineer'));
    expect(feed.fetchFeed).toHaveBeenLastCalledWith({
      term: 'design engineer',
      boardUrls: [...STARTER_DIRECTORY],
    });
  });

  it('watches a company board, and explains a link that is not one', async () => {
    const user = userEvent.setup();
    renderPanel();
    const input = screen.getByLabelText(/watch a company/i);
    await user.type(input, 'https://www.linkedin.com/company/ramp');
    await user.click(screen.getByRole('button', { name: 'Watch' }));
    expect(screen.getByText(/isn't a Greenhouse, Lever or Ashby job board/)).toBeInTheDocument();

    await user.clear(input);
    await user.type(input, 'jobs.ashbyhq.com/ramp');
    await user.click(screen.getByRole('button', { name: 'Watch' }));
    expect(getCurationState().tiles.map((t) => t.url)).toEqual(['https://jobs.ashbyhq.com/ramp']);
  });
});
