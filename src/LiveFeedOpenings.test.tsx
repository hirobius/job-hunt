import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ToastProvider } from '@hirobius/design-system';
import { axe } from 'vitest-axe';
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
vi.mock('./feed/fetchFeed', async (orig) => ({
  ...(await orig<typeof import('./feed/fetchFeed')>()),
  ...feed,
}));

import LiveFeedPanel from './LiveFeedPanel';
import { addCategory, replaceCurationState } from './curation/curationStore';
import { EMPTY_CURATION } from './curation/types';

const p = (id: string, company: string, title: string, url: string, source = 'ashby' as const) => ({
  id,
  source,
  title,
  company,
  url,
  location: '',
  text: 'Own the design system.',
});
const RESULT: FeedResult = {
  postings: [
    p('a:1', 'Ramp', 'Design Systems Lead', 'https://jobs.ashbyhq.com/ramp/1'),
    p('a:2', 'Ramp, Inc.', 'Design Systems Engineer', 'https://jobs.ashbyhq.com/ramp/2'),
    p(
      'h:3',
      'Zed',
      'Design Systems Designer',
      'https://news.ycombinator.com/item?id=3',
      'hn' as never,
    ),
  ],
  sources: [{ key: 'ashby:ramp', label: 'Ramp (Ashby)', fetched: 2 }],
};

let cat: string;
beforeEach(() => {
  localStorage.clear();
  window.location.hash = '#/discover/live';
  feed.fetchFeed.mockReset().mockResolvedValue(RESULT);
  replaceCurationState(EMPTY_CURATION);
  cat = addCategory({ label: 'My own thing' });
});
afterEach(() => {
  cleanup();
  window.location.hash = '';
});

const renderPanel = (boardUrls: string[] = []) =>
  render(
    <ToastProvider>
      <LiveFeedPanel categoryId={cat} terms={['design systems']} boardUrls={boardUrls} />
    </ToastProvider>,
  );

describe('Live postings are one list of openings', () => {
  it('has no Openings/Companies toggle', async () => {
    renderPanel();
    await screen.findByRole('list', { name: /live postings/i });
    expect(screen.queryByRole('radio', { name: 'Companies' })).toBeNull();
    expect(screen.queryByRole('radio', { name: 'Openings' })).toBeNull();
  });

  it('an old ?view=companies link falls back to the openings list without error', async () => {
    window.location.hash = '#/discover/live?view=companies';
    renderPanel();
    expect(await screen.findByRole('list', { name: /live postings/i })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: /companies/i })).toBeNull();
  });

  it('has no WCAG A/AA violations', async () => {
    const { container } = renderPanel();
    await screen.findByRole('list', { name: /live postings/i });
    const results = await axe(container, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    });
    expect(results.violations.map((v) => `${v.id} ×${v.nodes.length}`)).toEqual([]);
  });
});
