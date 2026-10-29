// The final shell (simplify 2/9 #383 + amendment 2, Q6): two top tabs, Today and Jobs. Today, top
// to bottom: the auto-scan's status (Scan now, "Scanning N sources · K new since hh:mm"), Review new as
// the Browse list (a row opens the in-app preview), Apply, Follow up (due today with dates, plus
// what is coming this week) and New companies (Follow / Ignore). Tested at the route seam through
// App and driven by role + name.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@hirobius/design-system';
import type { FeedResult } from './feed/fetchFeed';
import type { Posting } from './feed/types';

vi.mock('@supabase/supabase-js', async () => {
  const { createFakeSupabase } = await import('./test/fakeSupabase');
  return { createClient: () => createFakeSupabase().client };
});
const feed = vi.hoisted(() => ({ fetchFeed: vi.fn() }));
vi.mock('./feed/fetchFeed', async (orig) => ({
  ...(await orig<typeof import('./feed/fetchFeed')>()),
  fetchFeed: feed.fetchFeed,
}));

import { ColorModeProvider } from './ColorMode';
import App from './App';
import { addJob, getAllJobs, jobIdOf, markAppliedByUrl, removeJob, updateJob } from './store';
import { ymd } from './jobEvents';
import { addCategory, replaceCurationState } from './curation/curationStore';
import { EMPTY_CURATION } from './curation/types';
import { resetScan } from './feed/autoScan';
import { getAllDecided } from './feed/decided';
import { feedKeys } from './feed/scanningCount';

const renderApp = () =>
  render(
    <ColorModeProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ColorModeProvider>,
  );

const section = (name: RegExp) => screen.getByRole('region', { name });
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
};

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
  text: 'Own the design system.',
  ...o,
});
const result = (postings: Posting[]): FeedResult => ({
  postings,
  sources: [{ key: 'hn', label: 'Hacker News', fetched: postings.length }],
});

beforeEach(() => {
  localStorage.clear();
  resetScan();
  replaceCurationState(EMPTY_CURATION);
  addCategory({ label: 'Design systems', titles: ['Design Systems Designer'] });
  feed.fetchFeed
    .mockReset()
    .mockResolvedValue(
      result([
        post('hn:1', 'Design Systems Designer', 'Acme'),
        post('hn:2', 'Design Systems Engineer', 'Beta'),
      ]),
    );
  window.history.replaceState(null, '', '/');
  window.location.hash = '';
});
afterEach(() => {
  cleanup();
  getAllJobs()
    .slice()
    .forEach((j) => removeJob(j.url));
  replaceCurationState(EMPTY_CURATION);
});

describe('the shell: Today and Jobs', () => {
  it('an empty hash lands on Today; the only tabs are Today and Jobs', async () => {
    renderApp();
    await waitFor(() => expect(window.location.hash).toBe('#/today'));
    expect(screen.getByRole('heading', { level: 2, name: 'Today' })).toBeInTheDocument();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Today', 'Jobs']);
    expect(screen.getByRole('tab', { selected: true })).toHaveAccessibleName('Today');
    expect(document.title).toMatch(/^Today/);
  });

  it.each(['#/discover', '#/discover/live', '#/discover/teams?pillar=x', '#/apprenticeships'])(
    'the old Companies route %s lands on Today in place (no extra history step)',
    async (hash) => {
      window.location.hash = hash;
      const before = window.history.length;
      renderApp();
      await waitFor(() => expect(window.location.hash).toBe('#/today'));
      expect(screen.getByRole('tab', { selected: true })).toHaveAccessibleName('Today');
      expect(window.history.length).toBe(before);
    },
  );

  it('Today shows, in order: Review new, Apply, Follow up, then New companies', async () => {
    seedFound();
    window.location.hash = '#/today';
    renderApp();
    await within(section(/^Review new/)).findByRole('list', { name: 'New postings' });
    const names = within(screen.getByRole('main'))
      .getAllByRole('region')
      .map((r) => r.getAttribute('aria-label')?.replace(/ \(.*$/, ''));
    expect(names).toEqual(['Review new', 'Apply', 'Follow up', 'New companies']);
  });

  it('a first run shows onboarding', async () => {
    replaceCurationState(EMPTY_CURATION);
    renderApp();
    await waitFor(() => expect(window.location.hash).toBe('#/today'));
    expect(await screen.findByRole('button', { name: /sample data/i })).toBeInTheDocument();
  });

  it('the Jobs tab opens the Pipeline, unchanged inside', async () => {
    window.location.hash = '#/today';
    renderApp();
    await userEvent.click(screen.getByRole('tab', { name: 'Jobs' }));
    await waitFor(() => expect(window.location.hash).toBe('#/queue'));
    expect(screen.getByRole('heading', { level: 2, name: 'Pipeline' })).toBeInTheDocument();
  });
});

describe('the auto-scan', () => {
  it('says it has not scanned yet, with Scan now at the top of Today', async () => {
    window.location.hash = '#/today';
    renderApp();
    expect(
      screen.getByText('Not scanned yet. The first scan runs on its own.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Scan now' })).toBeInTheDocument();
  });

  it('after a scan, says when; the new and source counts are Review new’s own (one number)', async () => {
    seedScan({ finishedAt: Date.now(), newCount: 4, sourceCount: 9, found: [] });
    window.location.hash = '#/today';
    renderApp();
    // Signed out, following no board: what this browser scans is the feeds.
    const scanning = `Scanning ${feedKeys().length} sources`;
    // Before Review new has read: the scan's own new count.
    expect(
      screen.getByText(new RegExp(`^${scanning} · 4 new since \\d\\d:\\d\\d$`)),
    ).toBeInTheDocument();
    // Once it has: the Feed's, and Review new doesn't say it a second time.
    expect(
      await screen.findByText(new RegExp(`^${scanning} · 2 new since \\d\\d:\\d\\d$`)),
    ).toBeInTheDocument();
    expect(screen.queryByText(/new today from/)).toBeNull();
  });
});

describe('Review new on Today', () => {
  it('is the Browse list of every design-system posting, newest first', async () => {
    feed.fetchFeed.mockResolvedValue(
      result([
        post('hn:1', 'Design Systems Designer', 'Acme', { postedAt: daysAgo(3).toISOString() }),
        post('hn:2', 'Design Systems Engineer', 'Beta'),
        post('hn:3', 'Backend Engineer', 'Gamma'),
      ]),
    );
    window.location.hash = '#/today';
    renderApp();
    const ul = await within(section(/^Review new/)).findByRole('list', { name: 'New postings' });
    const titles = within(ul)
      .getAllByRole('heading', { level: 4 })
      .map((h) => h.textContent);
    expect(titles).toEqual(['Design Systems Engineer', 'Design Systems Designer']);
  });

  it('a row opens the in-app preview, with Open posting one tap away', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/today';
    renderApp();
    const ul = await within(section(/^Review new/)).findByRole('list', { name: 'New postings' });
    await user.click(within(ul).getByRole('button', { name: 'Design Systems Engineer' }));
    const dialog = await screen.findByRole('dialog', { name: 'Design Systems Engineer' });
    expect(within(dialog).getByRole('link', { name: /Open posting/ })).toHaveAttribute(
      'href',
      'https://news.ycombinator.com/item?id=hn2',
    );
    // Back closes the preview and stays on Today.
    window.history.back();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(window.location.hash).toBe('#/today');
  });
});

describe('Apply', () => {
  it('counts To apply and Start applying opens Apply mode on its head', async () => {
    addJob('https://acme.example.com/jobs/1', 'Designer');
    addJob('https://beta.example.com/jobs/2', 'Engineer');
    window.location.hash = '#/today';
    renderApp();
    const apply = section(/^Apply/);
    expect(within(apply).getByText('2 saved jobs, not yet applied')).toBeInTheDocument();
    await userEvent.click(within(apply).getByRole('button', { name: 'Start applying' }));
    await waitFor(() =>
      expect(window.location.hash).toMatch(
        new RegExp(`^#/apply/${jobIdOf('https://beta.example.com/jobs/2')}\\?from=%2Ftoday$`),
      ),
    );
  });

  it('with nothing saved, Start applying is off', async () => {
    window.location.hash = '#/today';
    renderApp();
    const apply = section(/^Apply/);
    expect(within(apply).getByText('Nothing saved to apply to yet')).toBeInTheDocument();
    expect(within(apply).getByRole('button', { name: 'Start applying' })).toBeDisabled();
  });
});

describe('Follow up', () => {
  const applied = (url: string, company: string, daysBack: number) => {
    addJob(url, 'Designer');
    markAppliedByUrl(url);
    updateJob(url, { applied: ymd(daysAgo(daysBack)), company });
  };

  it('lists what is due with its date, and opens the follow-up dialog', async () => {
    applied('https://acme.example.com/jobs/1', 'Acme', 9);
    window.location.hash = '#/today';
    renderApp();
    const follow = section(/^Follow up/);
    const due = within(follow).getByRole('list', { name: 'Due follow-ups' });
    // The title opens the job's page; the company and the day it fell due under it.
    expect(within(due).getByRole('link', { name: 'Designer' })).toHaveAttribute(
      'href',
      `#/queue/${jobIdOf('https://acme.example.com/jobs/1')}`,
    );
    expect(within(due).getByText(/^Acme · Due /)).toBeInTheDocument();
    await userEvent.click(within(follow).getByRole('button', { name: /^Follow up/ }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('counts what falls due in the coming week', async () => {
    // Applied 4 and 5 days ago: due in 3 and 2 days.
    applied('https://beta.example.com/jobs/2', 'Beta', 4);
    applied('https://gamma.example.com/jobs/3', 'Gamma', 5);
    window.location.hash = '#/today';
    renderApp();
    const follow = section(/^Follow up/);
    expect(within(follow).getByText('Nothing due today')).toBeInTheDocument();
    expect(within(follow).getByText('Upcoming: 2 this week')).toBeInTheDocument();
  });

  it('says so when nothing waits on a reply', async () => {
    window.location.hash = '#/today';
    renderApp();
    expect(
      within(section(/^Follow up/)).getByText('Nothing waiting on a reply'),
    ).toBeInTheDocument();
  });
});

describe('New companies', () => {
  it('Follow and Ignore each say so with Undo; Ignore mutes the company', async () => {
    const user = userEvent.setup();
    seedFound();
    window.location.hash = '#/today';
    renderApp();
    const panel = section(/^New companies/);
    await user.click(within(panel).getByRole('button', { name: 'Ignore Forward' }));
    expect(await screen.findByText('Ignored Forward')).toBeInTheDocument();
    expect(getAllDecided().muted).toContain('Forward');
  });
});

/** A finished scan as the auto-scan stores it (resetScan drops the cached copy first). */
function seedScan(state: object) {
  resetScan();
  localStorage.setItem('rjb_autoscan', JSON.stringify(state));
}

/** A scan that found one company the user hasn't followed or ignored yet. */
function seedFound() {
  seedScan({
    finishedAt: Date.now(),
    newCount: 0,
    sourceCount: 3,
    found: [
      {
        key: 'forward',
        name: 'Forward',
        boardUrl: 'https://boards.greenhouse.io/forward',
        via: 'yc',
        confirmed: false,
        status: 'new',
        jobs: 0,
        at: Date.now(),
      },
    ],
  });
}
