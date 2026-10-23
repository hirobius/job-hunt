import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
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
import { readMustInclude, setMustInclude } from './feed/mustInclude';
import { getAllJobs } from './store';

const post = (id: string, title: string, text: string) => ({
  id,
  source: 'ashby' as const,
  title,
  text,
  company: 'Acme',
  location: '',
  url: `https://jobs.ashbyhq.com/a/${id}`,
});
const RESULT: FeedResult = {
  postings: [
    post('1', 'Design Systems Designer', 'Own the library.'),
    post('2', 'Product Designer', 'Grow our design system with us.'),
    post('3', 'Product Designer, Growth', 'Join our partner ecosystem.'),
    post('4', 'UI Systems Designer', 'Tokens and components.'),
  ],
  sources: [{ key: 'hn', label: 'Hacker News', fetched: 4 }],
};

let cat: string;
beforeEach(() => {
  localStorage.clear();
  feed.fetchFeed.mockReset().mockResolvedValue(RESULT);
  replaceCurationState(EMPTY_CURATION);
  cat = addCategory({ label: 'Design Systems', seniority: 'any' });
});
afterEach(cleanup);

const renderPanel = () =>
  render(
    <ToastProvider>
      <LiveFeedPanel categoryId={cat} terms={['designer']} boardUrls={[]} calibrate />
    </ToastProvider>,
  );
const titles = () =>
  within(screen.getByRole('list', { name: 'Live postings' }))
    .getAllByRole('heading', { level: 3 })
    .map((h) => h.textContent?.replace(' (opens in new tab)', ''));

describe('must include in Live postings', () => {
  it('shows only postings that say systems in the title or description, and counts the rest', async () => {
    setMustInclude(cat, { terms: ['systems'] });
    renderPanel();
    await screen.findByRole('list', { name: /live postings/i });
    expect(titles()).toEqual(
      expect.arrayContaining([
        'Design Systems Designer',
        'Product Designer',
        'UI Systems Designer',
      ]),
    );
    expect(titles()).not.toContain('Product Designer, Growth'); // "ecosystem" is not "systems"
    expect(screen.getByText(/1 hidden by must include/i)).toBeInTheDocument();
  });

  it('is edited in Calibrate as chips, per track and kept', async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByRole('list', { name: /live postings/i });
    expect(titles()).toHaveLength(4);
    const field = screen.getByRole('textbox', { name: 'Add a word' });
    await user.type(field, 'systems{Enter}');
    expect(readMustInclude(cat).terms).toEqual(['systems']);
    expect(titles()).toHaveLength(3);
    await user.click(screen.getByRole('button', { name: 'Remove systems' }));
    expect(readMustInclude(cat).terms).toEqual([]);
    expect(titles()).toHaveLength(4);
  });

  it('Save all saves only what must include lets through', async () => {
    const user = userEvent.setup();
    setMustInclude(cat, { terms: ['systems'] });
    renderPanel();
    await screen.findByRole('list', { name: /live postings/i });
    await user.click(screen.getByRole('button', { name: 'Openings options' }));
    await user.click(screen.getByRole('menuitem', { name: 'Save all (3)' }));
    expect(getAllJobs().map((j) => j.label)).not.toContain('Product Designer, Growth');
    expect(getAllJobs()).toHaveLength(3);
  });
});
