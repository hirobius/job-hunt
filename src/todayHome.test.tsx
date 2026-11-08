// The final shell (simplify 2/9 #383 + amendment 2, Q6; #471): two top tabs, Find and Apply. Find,
// top to bottom: the auto-scan's status (Scan now, "Scanning N sources · Last scanned hh:mm, K new"),
// Review new as the Browse list (a title selects the posting: #/find/<fingerprint>) and New
// companies (Follow / Ignore). At lg the selected posting is the right column ("Pick a posting"
// until one is picked); below lg its own view with Back and a pager. Follow up and Apply moved to
// the Apply tab (#471 slice 3). Tested at the route seam through App and driven by role + name.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { openAllJobs } from './test/allJobs';
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
import { addJob, getAllJobs, markAppliedByUrl, removeJob, updateJob } from './store';
import { ymd } from './jobEvents';
import { viewport } from './test/viewport';
import { getProfile, replaceProfiles, saveProfile } from './profile';
import { resetScan } from './feed/autoScan';
import { getAllDecided } from './feed/decided';

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
  saveProfile({ titles: ['Design Systems Designer'], mode: 'remote' });
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
  // viewport() installs a matchMedia stub; drop it so the next test is narrow again.
  delete (window as { matchMedia?: unknown }).matchMedia;
  getAllJobs()
    .slice()
    .forEach((j) => removeJob(j.url));
});

describe('the shell: Today and Jobs', () => {
  it('an empty hash lands on Today; the only tabs are Today and Jobs', async () => {
    renderApp();
    await waitFor(() => expect(window.location.hash).toBe('#/find'));
    expect(screen.getByRole('heading', { level: 1, name: 'Find' })).toBeInTheDocument();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Find', 'Apply']);
    expect(screen.getByRole('tab', { selected: true })).toHaveAccessibleName('Find');
    expect(document.title).toMatch(/^Find/);
  });

  it.each(['#/discover', '#/discover/live', '#/discover/teams?pillar=x', '#/apprenticeships'])(
    'the old Companies route %s lands on Today in place (no extra history step)',
    async (hash) => {
      window.location.hash = hash;
      const before = window.history.length;
      renderApp();
      await waitFor(() => expect(window.location.hash).toBe('#/find'));
      expect(screen.getByRole('tab', { selected: true })).toHaveAccessibleName('Find');
      expect(window.history.length).toBe(before);
    },
  );

  it('Find shows, in order: Review new, then New companies; Follow up and Apply are on Apply', async () => {
    seedFound();
    window.location.hash = '#/find';
    renderApp();
    await within(section(/^Review new/)).findByRole('list', { name: 'New postings' });
    const names = within(screen.getByRole('main'))
      .getAllByRole('region')
      .map((r) => r.getAttribute('aria-label')?.replace(/ \(.*$/, ''));
    expect(names).toEqual(['Review new', 'New companies']);
    expect(screen.queryByRole('button', { name: /Start applying|Resume applying/ })).toBeNull();
  });

  it('a first run opens on Today with the design-systems profile, no setup screen', async () => {
    replaceProfiles([]);
    renderApp();
    await waitFor(() => expect(window.location.hash).toBe('#/find'));
    await waitFor(() => expect(getProfile()).not.toBeNull());
    expect(await screen.findByRole('region', { name: /^Review new/ })).toBeInTheDocument();
    expect(screen.queryByText('Set up your search')).toBeNull();
  });

  it('the Jobs tab opens the Pipeline, unchanged inside', async () => {
    window.location.hash = '#/find';
    renderApp();
    await userEvent.click(screen.getByRole('tab', { name: 'Apply' }));
    await waitFor(() => expect(window.location.hash).toBe('#/apply'));
    expect(screen.getByRole('heading', { level: 1, name: 'Apply' })).toBeInTheDocument();
  });
});

describe('the auto-scan', () => {
  it('signed out: one compact Scan now beside the Review new heading, and no status text', async () => {
    seedScan({ finishedAt: Date.now(), newCount: 4, sourceCount: 9, found: [] });
    window.location.hash = '#/find';
    renderApp();
    const review = await screen.findByRole('region', { name: /^Review new/ });
    expect(within(review).getByRole('button', { name: 'Scan now' })).toBeInTheDocument();
    await within(review).findByText('Browse');
    // Adrian 2026-11-08: the scan's line, the sources unavailable and the "not shown" counts are the
    // Account menu's Scan details.
    expect(
      screen.queryByText(/^Scanning |^Last scanned|^Not scanned|unavailable · details|^Not shown/),
    ).toBeNull();
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
    window.location.hash = '#/find';
    renderApp();
    const ul = await within(section(/^Review new/)).findByRole('list', { name: 'New postings' });
    const titles = within(ul)
      .getAllByRole('heading', { level: 3 })
      .map((h) => h.textContent);
    expect(titles).toEqual(['Design Systems Engineer', 'Design Systems Designer']);
  });

  it('below lg there is no posting page: the title is no link, the card shows its description', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/find';
    renderApp();
    const ul = await within(section(/^Review new/)).findByRole('list', { name: 'New postings' });
    const card = within(ul)
      .getAllByRole('article')
      .find((a) => within(a).queryByText('Beta'))!;
    expect(within(card).queryByRole('link', { name: 'Design Systems Engineer' })).toBeNull();
    expect(
      within(card).getByRole('link', { name: 'Open posting for Design Systems Engineer at Beta' }),
    ).toHaveAttribute('href', 'https://news.ycombinator.com/item?id=hn2');
    await user.click(within(card).getByRole('button', { name: 'Show description' }));
    expect(within(card).getByRole('button', { name: 'Hide description' })).toBeInTheDocument();
    expect(window.location.hash).toBe('#/find');
    expect(screen.getByRole('heading', { level: 1, name: 'Find' })).toBeInTheDocument();
  });

  it('at lg nothing is selected when the tab opens; a pick shows beside the list, in place', async () => {
    viewport(1280);
    const user = userEvent.setup();
    window.location.hash = '#/find';
    renderApp();
    const ul = await within(section(/^Review new/)).findByRole('list', { name: 'New postings' });
    expect(screen.getByText('Pick a posting')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Find' })).toBeInTheDocument();
    const steps = window.history.length;
    await user.click(within(ul).getByRole('link', { name: 'Design Systems Engineer' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Design Systems Engineer' }),
    ).toBeInTheDocument();
    // The list stays, its card marked current; a pick replaces the history entry.
    expect(screen.getByRole('list', { name: 'New postings' })).toBeInTheDocument();
    expect(window.history.length).toBe(steps);
    expect(within(ul).getAllByRole('article', { current: true })).toHaveLength(1);
    expect(screen.queryByRole('navigation', { name: 'Postings in the list' })).toBeNull();
  });

  it('a decision on the selected posting moves on to the next one', async () => {
    viewport(1280);
    const user = userEvent.setup();
    window.location.hash = '#/find/beta%3A%3Adesign%20systems%20engineer';
    renderApp();
    const detail = (
      await screen.findByRole('heading', { level: 1, name: 'Design Systems Engineer' })
    ).closest('section')!;
    await user.click(
      within(detail as HTMLElement).getByRole('button', {
        name: 'Skip Design Systems Engineer at Beta',
      }),
    );
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Design Systems Designer' }),
    ).toBeInTheDocument();
    expect(getAllDecided().decided.map((d) => d.fingerprint)).toContain(
      'beta::design systems engineer',
    );
  });
});

describe('Follow up and Apply live on the Apply tab (#471 slice 3)', () => {
  it('a due follow-up shows under Apply, not on Find', async () => {
    addJob('https://acme.example.com/jobs/1', 'Designer');
    markAppliedByUrl('https://acme.example.com/jobs/1');
    updateJob('https://acme.example.com/jobs/1', { applied: ymd(daysAgo(9)), company: 'Acme' });
    window.location.hash = '#/find';
    renderApp();
    await within(section(/^Review new/)).findByRole('list', { name: 'New postings' });
    expect(screen.queryByRole('region', { name: /^Follow up/ })).toBeNull();
    expect(screen.queryByRole('region', { name: /^Apply/ })).toBeNull();
    await userEvent.click(screen.getByRole('tab', { name: 'Apply' }));
    // On a phone, in the Apply list (the All jobs sheet, Proposal A).
    await openAllJobs();
    expect(await screen.findByRole('region', { name: /^Follow up/ })).toBeInTheDocument();
  });
});

describe('New companies', () => {
  it('Follow and Ignore each say so with Undo; Ignore mutes the company', async () => {
    const user = userEvent.setup();
    seedFound();
    window.location.hash = '#/find';
    renderApp();
    const panel = section(/^New companies/);
    // No matching job yet: folded under one disclosure (Adrian 2026-11-08).
    await user.click(within(panel).getByRole('button', { name: 'Show 1 with no matching jobs' }));
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
