import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
vi.mock('./feed/fetchFeed', () => feed);

import LiveFeedPanel from './LiveFeedPanel';
import { addCategory, getCurationState, replaceCurationState } from './curation/curationStore';
import { EMPTY_CURATION } from './curation/types';
import { saveTarget } from './feed/targets';

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

describe('By company view', () => {
  it('switches to companies without refetching, and back', async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByRole('list', { name: /live postings/i });
    expect(feed.fetchFeed).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('radio', { name: 'Companies' }));
    const list = await screen.findByRole('list', { name: /companies/i });
    const rows = Array.from(list.children) as HTMLElement[];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Ramp');
    expect(rows[0]).toHaveTextContent('2 openings mention your search');
    expect(within(rows[0]).getAllByRole('link')).toHaveLength(2);
    expect(rows[1]).toHaveTextContent('1 opening mentions your search');
    expect(window.location.hash).toContain('view=companies');
    expect(feed.fetchFeed).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('radio', { name: 'Openings' }));
    expect(await screen.findByRole('list', { name: /live postings/i })).toBeInTheDocument();
    expect(window.location.hash).not.toContain('view=');
  });

  it('opens straight to companies when the hash says so (refresh restores it)', async () => {
    window.location.hash = '#/discover/live?view=companies';
    renderPanel();
    expect(await screen.findByRole('list', { name: /companies/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Companies' })).toBeChecked();
  });

  it('Watch files the company board as a tile; no Watch for a company already watched or with no board', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(await screen.findByRole('radio', { name: 'Companies' }));
    const list = await screen.findByRole('list', { name: /companies/i });
    const [ramp, zed] = Array.from(list.children) as HTMLElement[];
    expect(within(zed).queryByRole('button', { name: /watch/i })).toBeNull();
    await user.click(within(ramp).getByRole('button', { name: /watch ramp/i }));
    expect(getCurationState().tiles.map((t) => t.url)).toEqual(['https://jobs.ashbyhq.com/ramp']);
  });

  it('hides Watch for a board the track already watches', async () => {
    const user = userEvent.setup();
    renderPanel(['https://jobs.ashbyhq.com/ramp']);
    await user.click(await screen.findByRole('radio', { name: 'Companies' }));
    const list = await screen.findByRole('list', { name: /companies/i });
    expect(within(list).queryByRole('button', { name: /watch/i })).toBeNull();
  });

  it('lists saved outreach targets under the companies, with stars and open roles', async () => {
    const user = userEvent.setup();
    saveTarget(cat, {
      login: 'acme',
      company: 'Acme Design',
      repo: 'acme/ds',
      repoUrl: 'https://github.com/acme/ds',
      stars: 1234,
      board: { kind: 'lever', slug: 'acme' },
      openRoles: 2,
    });
    renderPanel();
    expect(screen.queryByRole('list', { name: 'Saved targets' })).toBeNull();
    await user.click(await screen.findByRole('radio', { name: 'Companies' }));
    const saved = await screen.findByRole('list', { name: 'Saved targets' });
    expect(saved).toHaveTextContent('Acme Design');
    expect(saved).toHaveTextContent('1,234 stars');
    expect(saved).toHaveTextContent('Open roles: 2');
    expect(
      within(saved).getByRole('button', { name: 'Watch board for Acme Design' }),
    ).toBeVisible();
  });

  it('points to the Teams tool when nothing is saved', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(await screen.findByRole('radio', { name: 'Companies' }));
    expect(await screen.findByRole('link', { name: 'Find design-system teams' })).toHaveAttribute(
      'href',
      '#/discover/teams',
    );
  });

  it('has no WCAG A/AA violations', async () => {
    const user = userEvent.setup();
    const { container } = renderPanel();
    await user.click(await screen.findByRole('radio', { name: 'Companies' }));
    await screen.findByRole('list', { name: /companies/i });
    const results = await axe(container, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    });
    expect(results.violations.map((v) => `${v.id} ×${v.nodes.length}`)).toEqual([]);
  });
});
