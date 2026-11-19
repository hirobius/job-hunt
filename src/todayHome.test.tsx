// The final shell (simplify 2/9 #383 + amendment 2, Q6; #471): two top tabs, Find and Apply. Find,
// top to bottom: the auto-scan's status (Scan now, "Scanning N sources · Last scanned hh:mm, K new"),
// Review new as the Browse list (a title selects the posting: #/review/<fingerprint>); the found
// companies are the Companies dialog's Found list (#618). At lg the selected posting is the right
// column (the first posting when the tab opens, #546); below lg the list alone, with no pager (2026-11-14). Follow up and Apply moved to
// the Apply tab (#471 slice 3). Tested at the route seam through App and driven by role + name.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { openAllJobs } from './test/allJobs';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@hirobius/design-system';
import type { FeedResult } from './feed/fetchFeed';
import type { Posting } from './feed/types';

// One fake for the file, made before any test, so a test can sign it in before the app boots.
const h = await vi.hoisted(async () => {
  const { createFakeSupabase } = await import('./test/fakeSupabase');
  return { fake: createFakeSupabase() };
});
vi.mock('@supabase/supabase-js', () => ({ createClient: () => h.fake.client }));
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
import { topTab, topTabs, currentTab } from './test/topTabs';
import { signInAtBoot } from './test/signedIn';
import { resetSignInAsk } from './signInAsked';
import { demoReload } from './demo/demoMode';
import { activateDemoStorage, DEMO_FLAG, restoreRealStorage } from './demo/demoStorage';

const renderApp = () =>
  render(
    <ColorModeProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ColorModeProvider>,
  );

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
  h.fake.reset();
  // A new page load: a signed-out Review opens the sign-in screen (#755).
  resetSignInAsk();
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
    await waitFor(() => expect(window.location.hash).toBe('#/review'));
    // Signed out, the sign-in screen opens over Review (#755); Continue without an account.
    await userEvent.click(
      await screen.findByRole('button', { name: 'Continue without an account' }),
    );
    expect(await screen.findByRole('heading', { level: 1, name: 'Review' })).toBeInTheDocument();
    expect(topTabs().map((t) => t.textContent)).toEqual(['Review', 'Apply']);
    expect(currentTab('Review')).toBeInTheDocument();
    expect(document.title).toMatch(/^Review/);
  });

  it.each(['#/discover', '#/discover/live', '#/discover/teams?pillar=x', '#/apprenticeships'])(
    'the old Companies route %s lands on Today in place (no extra history step)',
    async (hash) => {
      window.location.hash = hash;
      const before = window.history.length;
      renderApp();
      await waitFor(() => expect(window.location.hash).toBe('#/review'));
      // The sign-in screen over a signed-out Review hides the page from assistive tech (#755).
      await screen.findByRole('button', { name: 'Continue without an account' });
      expect(currentTab('Review', { hidden: true })).toBeInTheDocument();
      // The one step is the sign-in screen's own (Back closes it), not the redirect's.
      expect(window.history.length).toBe(before + 1);
    },
  );

  it('Review shows Review new only (found companies are in the Companies dialog, #618); Follow up and Apply are on Apply', async () => {
    signInAtBoot(h.fake);
    seedFound();
    window.location.hash = '#/review';
    renderApp();
    await screen.findByRole('list', { name: 'New postings' });
    const names = within(screen.getByRole('main'))
      .getAllByRole('region')
      .map((r) => r.getAttribute('aria-label')?.replace(/ \(.*$/, ''));
    expect(names).toEqual(['New postings']);
    expect(screen.queryByText('New companies')).toBeNull();
    expect(screen.queryByRole('button', { name: /Start applying|Resume applying/ })).toBeNull();
  });

  it('a first run opens on Review with the design-systems profile, no setup screen', async () => {
    signInAtBoot(h.fake);
    replaceProfiles([]);
    renderApp();
    await waitFor(() => expect(window.location.hash).toBe('#/review'));
    await waitFor(() => expect(getProfile()).not.toBeNull());
    expect(await screen.findByRole('region', { name: /^New postings$/ })).toBeInTheDocument();
    expect(screen.queryByText('Set up your search')).toBeNull();
  });

  it('the Jobs tab opens the Apply tab, unchanged inside', async () => {
    window.location.hash = '#/review';
    renderApp();
    // Signed out, the sign-in screen opens over Review (#755); Continue without an account.
    await userEvent.click(
      await screen.findByRole('button', { name: 'Continue without an account' }),
    );
    await userEvent.click(topTab('Apply'));
    await waitFor(() => expect(window.location.hash).toBe('#/apply'));
    expect(screen.getByRole('heading', { level: 1, name: 'Apply' })).toBeInTheDocument();
  });
});

describe('the auto-scan', () => {
  // Signed out, Review reads nothing (#755): the sign-in screen opens over one line and one
  // Sign in key; no feed read, no scan, no Scan now in the Account menu, no count on the tab.
  it('signed out: the sign-in screen, no feed read, no Scan now and no count', async () => {
    const user = userEvent.setup();
    seedScan({ finishedAt: Date.now() - 2 * 3600_000, newCount: 4, sourceCount: 9, found: [] });
    window.location.hash = '#/review';
    renderApp();
    await user.click(await screen.findByRole('button', { name: 'Continue without an account' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Review' })).toBeInTheDocument();
    expect(screen.getByText('Sign in to see new postings.')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'New postings' })).toBeNull();
    expect(currentTab('Review').textContent).toBe('Review');
    await user.click(screen.getByRole('button', { name: /^Account/ }));
    expect(await screen.findByRole('menuitem', { name: 'Search profile' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /^(Scan now|Stop scan)$/ })).toBeNull();
    await user.keyboard('{Escape}');
    // The Sign in key opens the sign-in screen again.
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(
      await screen.findByRole('button', { name: 'Continue without an account' }),
    ).toBeInTheDocument();
    expect(feed.fetchFeed).not.toHaveBeenCalled();
  });
});

describe('Try a demo, signed out (#755, #835)', () => {
  afterEach(() => restoreRealStorage());

  it('starts a demo tab: it reloads onto Review, and nothing of the visitor’s is touched', async () => {
    const reload = vi.fn();
    demoReload.now = reload;
    addJob('https://mine.example/1', 'My real job');
    const user = userEvent.setup();
    window.location.hash = '#/review';
    renderApp();
    // The sign-in screen's grey key (the signed-out Review offers its own only with no jobs).
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Try a demo' }));
    expect(reload).toHaveBeenCalledOnce();
    expect(sessionStorage.getItem(DEMO_FLAG)).toBe('1');
    expect(window.location.hash).toBe('#/review');
    expect(getAllJobs().map((j) => j.url)).toEqual(['https://mine.example/1']);
    expect(feed.fetchFeed).not.toHaveBeenCalled();
  });

  it('a demo tab shows sample postings under the demo note; Leave demo reloads out of it', async () => {
    const reload = vi.fn();
    demoReload.now = reload;
    activateDemoStorage();
    const user = userEvent.setup();
    window.location.hash = '#/review';
    renderApp();
    expect(await screen.findByText('This is a demo')).toBeInTheDocument();
    const list = await screen.findByRole('list', { name: 'New postings' });
    expect(within(list).getAllByRole('listitem').length).toBeGreaterThan(0);
    const leave = screen.getByRole('button', { name: 'Leave demo' });
    expect(leave).toHaveAttribute('data-variant', 'link'); // an exit is underlined text
    await user.click(leave);
    expect(reload).toHaveBeenCalledOnce();
    expect(sessionStorage.getItem(DEMO_FLAG)).toBeNull();
    expect(feed.fetchFeed).not.toHaveBeenCalled();
  });
});

describe('Review new on Today', () => {
  it('is the Browse list of every design-system posting, newest first', async () => {
    signInAtBoot(h.fake);
    feed.fetchFeed.mockResolvedValue(
      result([
        post('hn:1', 'Design Systems Designer', 'Acme', { postedAt: daysAgo(3).toISOString() }),
        post('hn:2', 'Design Systems Engineer', 'Beta'),
        post('hn:3', 'Backend Engineer', 'Gamma'),
      ]),
    );
    window.location.hash = '#/review';
    renderApp();
    const ul = await screen.findByRole('list', { name: 'New postings' });
    const titles = within(ul)
      .getAllByRole('heading', { level: 3 })
      .map((h) => h.textContent?.replace(/\u2060/g, '').replace(/\s*\(opens in new tab\)$/, ''));
    expect(titles).toEqual(['Design Systems Engineer', 'Design Systems Designer']);
  });

  it('below lg there is no posting page: the title is the link out to the posting', async () => {
    signInAtBoot(h.fake);
    window.location.hash = '#/review';
    renderApp();
    const ul = await screen.findByRole('list', { name: 'New postings' });
    const card = within(ul)
      .getAllByRole('article')
      .find((a) => within(a).queryByText('Beta'))!;
    const link = within(card.querySelector('h3')!).getByRole('link', {
      name: /^Design Systems Engineer/,
    });
    expect(link).toHaveAttribute('href', 'https://news.ycombinator.com/item?id=hn2');
    expect(link).toHaveAttribute('target', '_blank');
    expect(within(card).queryByRole('button', { name: /description/ })).toBeNull();
    expect(window.location.hash).toBe('#/review');
    expect(screen.getByRole('heading', { level: 1, name: 'Review' })).toBeInTheDocument();
  });

  it('at lg the tab opens on the first posting (#546); a pick shows beside the list, in place', async () => {
    signInAtBoot(h.fake);
    viewport(1280);
    const user = userEvent.setup();
    window.location.hash = '#/review';
    const steps = window.history.length;
    renderApp();
    const ul = await screen.findByRole('list', { name: 'New postings' });
    // Like Apply's first job (Adrian 2026-11-12): the first posting, its title the page's h1, in
    // place (no history step).
    const first = within(ul).getAllByRole('heading', { level: 3 })[0].textContent!;
    expect(await screen.findByRole('heading', { level: 1, name: first })).toBeInTheDocument();
    expect(screen.queryByText('Pick a posting')).toBeNull();
    expect(window.location.hash).toMatch(/^#\/review\/./);
    expect(window.history.length).toBe(steps);
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

  it('at lg the first posting waits while a dialog is open over Review (#546)', async () => {
    signInAtBoot(h.fake);
    viewport(1280);
    window.location.hash = '#/review?documents=';
    renderApp();
    expect(await screen.findByRole('dialog', { name: 'Documents' })).toBeInTheDocument();
    // The list has loaded behind the modal dialog (hidden from the accessibility tree there).
    await waitFor(() =>
      expect(
        document.querySelectorAll('[aria-label="New postings"] article').length,
      ).toBeGreaterThan(0),
    );
    // Selecting would be a new page, and a new page closes the dialog: it waits.
    await new Promise((r) => setTimeout(r, 300));
    expect(window.location.hash).toBe('#/review?documents=');
    expect(screen.getByRole('dialog', { name: 'Documents' })).toBeInTheDocument();
  });

  it('a decision on the selected posting moves on to the next one', async () => {
    signInAtBoot(h.fake);
    viewport(1280);
    const user = userEvent.setup();
    window.location.hash = '#/review/beta%3A%3Adesign%20systems%20engineer';
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
  it('a due follow-up shows under Apply, not on Review', async () => {
    signInAtBoot(h.fake);
    addJob('https://acme.example.com/jobs/1', 'Designer');
    markAppliedByUrl('https://acme.example.com/jobs/1');
    updateJob('https://acme.example.com/jobs/1', { applied: ymd(daysAgo(9)), company: 'Acme' });
    window.location.hash = '#/review';
    renderApp();
    await screen.findByRole('list', { name: 'New postings' });
    expect(screen.queryByRole('region', { name: /^Follow up/ })).toBeNull();
    expect(screen.queryByRole('region', { name: /^Apply/ })).toBeNull();
    await userEvent.click(topTab('Apply'));
    // On a phone, in the Apply list (the All jobs sheet, Proposal A): its Follow up view (#543).
    const sheet = await openAllJobs();
    expect(await within(sheet).findByRole('button', { name: 'Follow up 1' })).toBeInTheDocument();
  });
});

describe('Found companies: the Companies dialog (#618, Adrian 2026-11-12)', () => {
  it('Follow and Ignore each say so with Undo in the dialog; Ignore mutes the company', async () => {
    signInAtBoot(h.fake);
    const user = userEvent.setup();
    seedFound();
    window.location.hash = '#/review';
    renderApp();
    await screen.findByRole('list', { name: 'New postings' });
    await user.click(screen.getByRole('button', { name: 'Account' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Companies' }));
    const dialog = await screen.findByRole('dialog', { name: 'Companies' });
    await user.click(within(dialog).getByRole('radio', { name: 'Found (1)' }));
    // No matching job yet: folded under one disclosure (Adrian 2026-11-08).
    await user.click(within(dialog).getByRole('button', { name: 'Show 1 with no matching jobs' }));
    await user.click(within(dialog).getByRole('button', { name: 'Ignore Forward' }));
    // The toast behind a modal can't be reached: the dialog's footer says it, with Undo.
    expect(await within(dialog).findByText('Ignored Forward')).toBeInTheDocument();
    expect(getAllDecided().muted).toContain('Forward');
    // The last found company gone: the Found segment goes, one option stays checked.
    expect(within(dialog).queryByRole('radio', { name: /^Found/ })).toBeNull();
    expect(within(dialog).getByRole('radio', { name: /^Ignored \(1\)/ })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Undo' }));
    expect(getAllDecided().muted).not.toContain('Forward');
    expect(within(dialog).getByRole('radio', { name: 'Found (1)' })).toBeInTheDocument();
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
