// Review new (simplify 5/9, #386): Browse by default, the Deck as a toggle, Skip hides only that
// posting, Not this company mutes the company, Save makes a Job and follows its company.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@hirobius/design-system';
import { axe } from 'vitest-axe';
import type { FeedResult } from './feed/fetchFeed';
import type { Posting } from './feed/types';

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
vi.mock('./feed/fetchFeed', async (orig) => ({
  ...(await orig<typeof import('./feed/fetchFeed')>()),
  fetchFeed: feed.fetchFeed,
}));

import ReviewView, { REVIEW_PAGE } from './ReviewView';
import NoticeHost from './NoticeHost';
import { dismissNotice } from './saveNotice';
import { addCategory, replaceCurationState } from './curation/curationStore';
import { EMPTY_CURATION } from './curation/types';
import { getAllJobs, replaceAll } from './store';
import { starDream } from './feed/dreams';
import { setMustInclude } from './feed/mustInclude';
import { getAllDecided } from './feed/decided';
import { boardUrlsFor } from './feed/watchlist';

const now = new Date().toISOString();
const post = (id: string, title: string, company: string, o: Partial<Posting> = {}): Posting => ({
  id,
  source: 'hn',
  title,
  company,
  url: `https://news.ycombinator.com/item?id=${id.replace(/\W/g, '')}`,
  location: 'Remote',
  mode: 'remote',
  postedAt: now,
  text: 'Product designer role',
  ...o,
});
const result = (postings: Posting[]): FeedResult => ({
  postings,
  sources: [
    { key: 'hn', label: 'Hacker News', fetched: postings.length },
    { key: 'remotive', label: 'Remotive', fetched: 0 },
    { key: 'jobicy', label: 'Jobicy', fetched: 0, error: 'Jobicy: timed out.' },
  ],
});
const BASIC = [
  post('hn:1', 'Product Designer', 'Acme'),
  post('hn:2', 'Senior Product Designer, Growth', 'Acme'),
  post('hn:3', 'Product Designer', 'Beta'),
];

let cat: string;
beforeEach(() => {
  localStorage.clear();
  replaceAll([]);
  dismissNotice();
  replaceCurationState(EMPTY_CURATION);
  cat = addCategory({ label: 'Product design', titles: ['Product Designer'] });
  feed.fetchFeed.mockReset().mockResolvedValue(result(BASIC));
});
afterEach(cleanup);

const renderReview = () =>
  render(
    <ToastProvider>
      <ReviewView categoryId={cat} />
      <NoticeHost />
    </ToastProvider>,
  );
const list = () => screen.findByRole('list', { name: 'New postings' });
const titles = (ul: HTMLElement) =>
  within(ul)
    .getAllByRole('heading', { level: 4 })
    .map((h) => h.textContent?.replace(/\s*\(opens in new tab\)$/, ''));

describe('Review new: Browse', () => {
  it('lists every undecided posting and says how many are new from how many sources', async () => {
    const { container } = renderReview();
    const ul = await list();
    expect(titles(ul)).toHaveLength(3);
    expect(screen.getByText('3 new today from 2 sources')).toBeInTheDocument();
    expect(screen.getByText(/^Jobicy: timed out/)).toBeInTheDocument();
    // The title is the link into the posting.
    expect(within(ul).getAllByRole('link')[0]).toHaveAttribute(
      'href',
      expect.stringMatching(/^https:\/\/news\.ycombinator\.com/),
    );
    // One read: every title and board in one sweep.
    expect(feed.fetchFeed).toHaveBeenCalledTimes(1);
    expect(feed.fetchFeed.mock.calls[0][0]).toMatchObject({ terms: ['Product Designer'] });
    const results = await axe(container, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    });
    expect(results.violations.map((v) => `${v.id} ×${v.nodes.length}`)).toEqual([]);
  });

  it('Skip hides only that posting, never its company, with Undo', async () => {
    const user = userEvent.setup();
    renderReview();
    const ul = await list();
    await user.click(within(ul).getByRole('button', { name: 'Skip Product Designer at Acme' }));
    await waitFor(() => expect(titles(ul)).toHaveLength(2));
    expect(within(ul).getByText('Senior Product Designer, Growth')).toBeInTheDocument();
    expect(getAllDecided().decided).toHaveLength(1);
    await user.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(titles(ul)).toHaveLength(3));
  });

  it('Not this company hides every posting from it until unmuted', async () => {
    const user = userEvent.setup();
    renderReview();
    const ul = await list();
    await user.click(within(ul).getAllByRole('button', { name: 'Not this company: Acme' })[0]);
    await waitFor(() => expect(titles(ul)).toEqual(['Product Designer']));
    const muted = screen.getByRole('region', { name: 'Muted companies' });
    await user.click(within(muted).getByRole('button', { name: 'Unmute Acme' }));
    await waitFor(() => expect(titles(ul)).toHaveLength(3));
  });

  it('Save makes a Job and follows the company', async () => {
    const user = userEvent.setup();
    renderReview();
    const ul = await list();
    await user.click(within(ul).getByRole('button', { name: 'Save Product Designer at Beta' }));
    await waitFor(() => expect(titles(ul)).toHaveLength(2));
    expect(getAllJobs().map((j) => j.company)).toEqual(['Beta']);
    expect(getAllDecided().followed).toEqual(['Beta']);
    // Undo takes the job and the follow back, and the posting returns.
    await user.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(titles(ul)).toHaveLength(3));
    expect(getAllJobs()).toEqual([]);
    expect(getAllDecided().followed).toEqual([]);
  });

  it('saving a posting from a dream company’s board watches that board', async () => {
    starDream(cat, { company: 'Delta', board: { kind: 'ashby', slug: 'delta' } });
    feed.fetchFeed.mockResolvedValue(
      result([
        post('ashby:delta:1', 'Product Designer', 'Delta', {
          source: 'ashby',
          url: 'https://jobs.ashbyhq.com/delta/1',
        }),
      ]),
    );
    const user = userEvent.setup();
    renderReview();
    const ul = await list();
    // The dream's board is read, though no tile watches it.
    expect(feed.fetchFeed.mock.calls[0][0].boardUrls).toEqual(['https://jobs.ashbyhq.com/delta']);
    await user.click(within(ul).getByRole('button', { name: 'Save Product Designer at Delta' }));
    await waitFor(() => expect(boardUrlsFor(cat)).toEqual(['https://jobs.ashbyhq.com/delta']));
    // The board moved from the dream to a watched tile: the same request, no second read.
    expect(feed.fetchFeed).toHaveBeenCalledTimes(1);
  });

  it('sorts, filters with chips and loads more', async () => {
    const many = Array.from({ length: REVIEW_PAGE + 5 }, (_, i) =>
      post(`hn:${i + 10}`, `Product Designer ${i}`, `Co ${String(i).padStart(2, '0')}`, {
        postedAt: new Date(Date.now() - i * 864e5 * 3).toISOString(),
        text: i === 7 ? 'Product designer, contract role' : 'Product designer role',
      }),
    );
    feed.fetchFeed.mockResolvedValue(result(many));
    const user = userEvent.setup();
    renderReview();
    const ul = await list();
    expect(titles(ul)).toHaveLength(REVIEW_PAGE);
    await user.click(screen.getByRole('button', { name: 'Load more (5)' }));
    expect(titles(ul)).toHaveLength(REVIEW_PAGE + 5);
    await user.click(screen.getByRole('radio', { name: 'Company' }));
    expect(titles(ul)[0]).toBe('Product Designer 0');
    await user.click(screen.getByRole('button', { name: /^Contract, 1/ }));
    expect(titles(await list())).toEqual(['Product Designer 7']);
  });
});

describe('Review new: Deck', () => {
  it('shows one card at a time; a decided card makes way for the next', async () => {
    const user = userEvent.setup();
    renderReview();
    await list();
    await user.click(screen.getByRole('radio', { name: 'Deck' }));
    const first = screen.getByRole('article');
    const name = first.getAttribute('aria-label');
    await user.click(within(first).getByRole('button', { name: /^Skip / }));
    await waitFor(() =>
      expect(screen.getByRole('article')).not.toHaveAttribute('aria-label', name!),
    );
    expect(screen.getAllByRole('article')).toHaveLength(1);
  });
});

describe('Review new: the scorer', () => {
  it('keeps the Review bucket as its own section, with reasons', async () => {
    setMustInclude(cat, { terms: ['design systems'] });
    feed.fetchFeed.mockResolvedValue(
      result([
        post('hn:1', 'Design Systems Engineer', 'Orbit', { text: 'design tokens' }),
        post('hn:2', 'UX Engineer', 'Kite', { text: 'our design system' }),
        post('hn:3', 'Backend Engineer', 'Nimbus'),
      ]),
    );
    renderReview();
    const ul = await list();
    expect(titles(ul)).toEqual(['Design Systems Engineer']);
    expect(
      within(ul).getByText('Design-system title; mentions design tokens'),
    ).toBeInTheDocument();
    const review = screen.getByRole('list', { name: 'Held for review' });
    expect(titles(review)).toEqual(['UX Engineer']);
    // The related title is searched too.
    expect(feed.fetchFeed.mock.calls[0][0].terms).toContain('Design Technologist');
  });
});
