import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@hirobius/design-system';
import type { FeedResult } from './feed/fetchFeed';

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
import { addCategory, replaceCurationState } from './curation/curationStore';
import { EMPTY_CURATION } from './curation/types';

const base = { company: 'Acme', location: '', text: 'Own the design system.' };
const RESULT: FeedResult = {
  postings: [
    {
      ...base,
      id: 'a:1',
      source: 'ashby',
      title: 'Design Systems Engineer',
      url: 'https://jobs.ashbyhq.com/a/1',
    },
    {
      ...base,
      id: 'a:2',
      source: 'ashby',
      title: 'Senior Design Systems Engineer',
      url: 'https://jobs.ashbyhq.com/a/2',
    },
    {
      ...base,
      id: 'a:3',
      source: 'ashby',
      title: 'Design Systems Manager',
      url: 'https://jobs.ashbyhq.com/a/3',
    },
    {
      ...base,
      id: 'a:4',
      source: 'ashby',
      title: 'Design Systems Designer',
      url: 'https://jobs.ashbyhq.com/a/4',
      salaryMax: 80_000,
      currency: 'USD',
    },
  ],
  sources: [{ key: 'hn', label: 'Hacker News', fetched: 4 }],
  boardsSkipped: 0,
};

let cat: string;
beforeEach(() => {
  feed.fetchFeed.mockReset().mockResolvedValue(RESULT);
  replaceCurationState(EMPTY_CURATION);
  cat = addCategory({ label: 'Design Systems', seniority: 'any' });
});
afterEach(cleanup);

const renderPanel = () =>
  render(
    <ToastProvider>
      <LiveFeedPanel
        categoryId={cat}
        terms={['design systems']}
        boardUrls={[]}
        where=""
        mode="any"
        onWhere={() => {}}
        onMode={() => {}}
      />
    </ToastProvider>,
  );

const titles = () => screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);

describe('search targeting in the panel', () => {
  it('excludes a term and says how many it hid', async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByRole('list', { name: /live postings/i });
    expect(titles()).toHaveLength(4);
    await user.type(screen.getByLabelText(/leave out/i), 'manager');
    expect(titles()).not.toContain('Design Systems Manager');
    expect(screen.getByText(/1 hidden by what you left out/i)).toBeInTheDocument();
  });

  it('entry level hides senior titles and counts them', async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByRole('list', { name: /live postings/i });
    await user.click(screen.getByRole('radio', { name: /entry level/i }));
    expect(titles()).not.toContain('Senior Design Systems Engineer');
    expect(screen.getByText(/1 hidden by level/i)).toBeInTheDocument();
  });

  it('a pay floor hides low pay, keeps unstated pay; "only with pay" hides the rest', async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByRole('list', { name: /live postings/i });
    await user.type(screen.getByLabelText(/pay floor/i), '100000');
    expect(titles()).not.toContain('Design Systems Designer');
    expect(titles()).toHaveLength(3);
    expect(screen.getByText(/1 hidden by pay/i)).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: /only show postings with a salary/i }));
    expect(screen.queryByRole('list', { name: /live postings/i })).not.toBeInTheDocument();
  });

  it('starts from the track seniority', async () => {
    cat = addCategory({ label: 'Trades', seniority: 'entry' });
    renderPanel();
    await screen.findByRole('list', { name: /live postings/i });
    expect(screen.getByRole('radio', { name: /entry level/i })).toBeChecked();
    expect(titles()).not.toContain('Senior Design Systems Engineer');
  });
});
