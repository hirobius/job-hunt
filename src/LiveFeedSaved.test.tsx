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
import { FILTERS_KEY } from './feed/savedFilters';

const RESULT: FeedResult = {
  postings: [
    {
      id: 'a:1',
      source: 'ashby',
      title: 'Design Systems Engineer',
      company: 'Acme',
      url: 'https://jobs.ashbyhq.com/a/1',
      location: '',
      text: 'Own the design system. Contract work.',
    },
  ],
  sources: [{ key: 'hn', label: 'Hacker News', fetched: 1 }],
};

let cat: string;
let where = '';
let mode: 'any' | 'remote' | 'hybrid' | 'onsite' = 'any';
beforeEach(() => {
  localStorage.clear();
  where = '';
  mode = 'any';
  feed.fetchFeed.mockReset().mockResolvedValue(RESULT);
  replaceCurationState(EMPTY_CURATION);
  cat = addCategory({ label: 'Design Systems' });
});
afterEach(cleanup);

const renderPanel = () =>
  render(
    <ToastProvider>
      <LiveFeedPanel
        categoryId={cat}
        terms={['design systems', 'design engineer']}
        boardUrls={[]}
        where={where}
        mode={mode}
        onWhere={(v) => (where = v)}
        onMode={(v) => (mode = v)}
      />
    </ToastProvider>,
  );

describe('saved searches', () => {
  it('saves the whole bundle, survives a reload, and recalls it in one tap', async () => {
    const user = userEvent.setup();
    const first = renderPanel();
    await screen.findByRole('list', { name: /live postings/i });
    await user.type(screen.getByLabelText(/leave out/i), 'manager');
    await user.click(screen.getByRole('radio', { name: /experienced/i }));
    await user.type(screen.getByLabelText(/pay floor/i), '90000');
    await user.type(screen.getByLabelText(/name this search/i), 'Senior DS');
    await user.click(screen.getByRole('button', { name: /save search/i }));
    expect(JSON.parse(localStorage.getItem(FILTERS_KEY)!)[cat][0]).toMatchObject({
      name: 'Senior DS',
      term: 'design systems',
      exclude: ['manager'],
      seniority: 'experienced',
      salaryFloor: 90000,
    });

    first.unmount(); // a reload
    renderPanel();
    await screen.findByRole('list', { name: /live postings/i });
    expect(screen.getByLabelText(/leave out/i)).toHaveValue('');
    await user.click(screen.getByRole('button', { name: 'Senior DS' }));
    expect(screen.getByLabelText(/leave out/i)).toHaveValue('manager');
    expect(screen.getByRole('radio', { name: /experienced/i })).toBeChecked();
    expect(screen.getByLabelText(/pay floor/i)).toHaveValue('90000');
  });

  it('applying a saved search re-runs its term and restores location and mode', async () => {
    localStorage.setItem(
      FILTERS_KEY,
      JSON.stringify({
        [cat]: [
          {
            name: 'Eng Austin',
            term: 'design engineer',
            where: 'Austin, TX',
            mode: 'hybrid',
            exclude: [],
            seniority: 'any',
            salaryOnly: false,
            contractOnly: false,
          },
        ],
      }),
    );
    const user = userEvent.setup();
    renderPanel();
    await screen.findByRole('list', { name: /live postings/i });
    await user.click(screen.getByRole('button', { name: 'Eng Austin' }));
    expect(where).toBe('Austin, TX');
    expect(mode).toBe('hybrid');
    expect(feed.fetchFeed).toHaveBeenLastCalledWith(
      expect.objectContaining({ term: 'design engineer' }),
    );
  });

  it('removes a saved search', async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByRole('list', { name: /live postings/i });
    await user.type(screen.getByLabelText(/name this search/i), 'Temp');
    await user.click(screen.getByRole('button', { name: /save search/i }));
    await user.click(screen.getByRole('button', { name: /remove saved search temp/i }));
    expect(screen.queryByRole('button', { name: 'Temp' })).toBeNull();
  });

  it('corrupt storage renders the defaults, no crash', async () => {
    localStorage.setItem(FILTERS_KEY, '{{{not json');
    renderPanel();
    expect(await screen.findByRole('list', { name: /live postings/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/leave out/i)).toHaveValue('');
  });
});
