import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

// CloudSync instantiates a Supabase client at module load; stub it so App can render in jsdom
// without any network or real config. We only need the auth listener + a no-op query surface.
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      getSession: async () => ({ data: { session: null } }),
      signOut: async () => {},
      signInWithOtp: async () => ({}),
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
      upsert: async () => ({}),
      delete: () => ({ eq: async () => ({}) }),
    }),
  }),
}));

import { ToastProvider } from '@hirobius/design-system';
import { ColorModeProvider } from './ColorMode';
import App from './App';
import { currentTab, queryCurrentTab, topTab, topTabs } from './test/topTabs';
import { BRAND } from './brand';
import { setScanDetails } from './feed/scanDetails';
import { addJob, getAllJobs, removeJob } from './store';
import { setPipelineView } from './pipelineView';
import { act } from '@testing-library/react';

beforeEach(() => {
  window.location.hash = '';
});
afterEach(() => {
  cleanup();
  window.location.hash = '';
  setScanDetails(null);
  getAllJobs()
    .slice()
    .forEach((j) => removeJob(j.url));
});

const renderApp = () =>
  render(
    <ColorModeProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ColorModeProvider>,
  );

describe('App top-level tab wiring', () => {
  it('renders the two top tabs (Find · Apply) as links in a nav, each to its page', () => {
    renderApp();
    const tabs = topTabs();
    expect(tabs.map((t) => t.textContent)).toEqual(['Find', 'Apply']);
    expect(tabs.map((t) => t.getAttribute('href'))).toEqual(['#/find', '#/apply']);
    // Links, not ARIA tabs: no tab list, no tab panel (each opens a page).
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryByRole('tabpanel')).toBeNull();
  });

  it('the open one is aria-current="page", the other is not', () => {
    window.location.hash = '#/apply';
    renderApp();
    expect(topTab('Apply')).toHaveAttribute('aria-current', 'page');
    expect(topTab('Find')).not.toHaveAttribute('aria-current');
  });

  it('drawn as a segmented control but still a nav of links: a tap routes, Back returns (2026-11-09)', async () => {
    window.location.hash = '#/find';
    renderApp();
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(topTab('Find').className).toBe('rjb-seg');
    topTab('Apply').click();
    await vi.waitFor(() => expect(window.location.hash).toMatch(/^#\/apply/));
    await vi.waitFor(() => expect(topTab('Apply')).toHaveAttribute('aria-current', 'page'));
    window.history.back();
    await vi.waitFor(() => expect(window.location.hash).toBe('#/find'));
    await vi.waitFor(() => expect(topTab('Find')).toHaveAttribute('aria-current', 'page'));
  });

  it('defaults to the Today tab when the hash carries no route (#383)', () => {
    renderApp();
    expect(currentTab()).toHaveAccessibleName('Find');
  });
});

describe('an unknown route (review nit)', () => {
  it('#/nope shows a not-found page with a way home, not Today', async () => {
    window.location.hash = '#/nope';
    renderApp();
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    // No top tab is current.
    expect(queryCurrentTab()).toBeNull();
    expect(screen.queryByRole('tabpanel')).toBeNull();
    screen.getByRole('button', { name: 'Go to Find' }).click();
    await vi.waitFor(() => expect(window.location.hash).toBe('#/find'));
  });

  // Supabase's email link signs in through the hash (implicit flow), and an expired or used link
  // comes back as #error=…. Neither is a route: home (Today) shows. The tokens are left for auth-js;
  // the error is said in a toast and replaced by Today (shell.test.tsx has the toast).
  it.each([
    ['#access_token=a&refresh_token=b&expires_in=3600&token_type=bearer&type=magiclink', 'kept'],
    [
      '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
      'replaced',
    ],
  ])('a sign-in callback (%s) lands on Today, not Page not found', (hash, kept) => {
    window.location.hash = hash;
    renderApp();
    expect(currentTab('Find')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Page not found' })).toBeNull();
    expect(window.location.hash).toBe(kept === 'kept' ? hash : '#/find');
  });

  it('the old Trades slug (#/apprenticeships) still lands on home', () => {
    window.location.hash = '#/apprenticeships';
    renderApp();
    expect(currentTab('Find')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Page not found' })).toBeNull();
  });
});

// #279: the view-enter motion must not remount the page (a key on pageKey dropped focus on rail
// hops and reset the Apply pager). The stack stays one DOM node and the motion restarts on it.
describe('view-enter motion keeps the page mounted (#279)', () => {
  it('the same stack node survives route changes, and the enter class is restarted on a tab switch', async () => {
    const { act } = await import('@testing-library/react');
    renderApp();
    const stack = document.querySelector('.rjb-view-enter') as HTMLElement;
    expect(stack).toBeTruthy();
    const marker = document.createElement('input');
    stack.appendChild(marker);
    marker.focus();

    // In-place hop (same tab, other sub): nothing remounts, focus stays.
    await act(async () => {
      window.location.hash = '#/apply';
    });
    await act(async () => {
      window.location.hash = '#/apply/apply';
    });
    expect(document.querySelector('.rjb-view-enter')).toBe(stack);
    expect(marker.isConnected).toBe(true);

    // A page-kind change replays the motion by restarting the class on the same node.
    const removed = vi.spyOn(stack.classList, 'remove');
    await act(async () => {
      window.location.hash = '#/find';
    });
    expect(removed).toHaveBeenCalledWith('rjb-view-enter');
    expect(stack.classList.contains('rjb-view-enter')).toBe(true);
    expect(document.querySelector('.rjb-view-enter')).toBe(stack);
    expect(marker.isConnected).toBe(true);
  });
});

// One app-bar row at every width (redesign §5.1, #548): the logo and Account; Find / Apply moved into
// the page bar, the first row of main at top left (2026-11-12), each tab with its count. Find: the new postings Review new last read. Apply: its To apply count, whatever
// view is open (prod audit 2026-11-12).
describe('the one-row app bar (#548)', () => {
  it('the app bar is one row (logo, Account); Find and Apply open the page bar at top left of main', () => {
    renderApp();
    const nav = screen.getByRole('navigation', { name: 'Sections' });
    expect(nav).toHaveClass('rjb-segs');
    expect(nav.className).not.toMatch(/rjb-segs-full/);
    // The page bar is main's first row and the nav its first item (where the page title was).
    const bar = nav.parentElement as HTMLElement;
    expect(bar).toHaveClass('rjb-page-bar');
    expect(bar.firstElementChild).toBe(nav);
    expect(bar.parentElement).toBe(screen.getByRole('main'));
    expect(bar.parentElement?.firstElementChild).toBe(bar);
    // The app bar's one row: the logo and Account, no tabs.
    const logo = screen.getByRole('link', { name: `${BRAND.name}, Find` });
    const row = logo.parentElement as HTMLElement;
    expect(row.contains(screen.getByRole('button', { name: /^Account/ }))).toBe(true);
    expect(row.contains(nav)).toBe(false);
    expect(screen.getAllByRole('navigation', { name: 'Sections' })).toHaveLength(1);
  });

  it('Apply shows the count of jobs in its list, Find the new postings', async () => {
    addJob('https://acme.example/jobs/1', 'Design Engineer');
    addJob('https://acme.example/jobs/2', 'Design Technologist');
    setScanDetails({ failed: [], hidden: [], newToday: 7, sourcesRead: 3 });
    window.location.hash = '#/apply';
    renderApp();
    await vi.waitFor(() => expect(topTab('Apply')).toHaveAccessibleName('Apply 2'));
    expect(topTab('Find')).toHaveAccessibleName('Find 7');
  });

  it("Apply's count is the To apply count and does not change with the view", async () => {
    addJob('https://acme.example/jobs/1', 'Design Engineer');
    addJob('https://acme.example/jobs/2', 'Design Technologist');
    window.location.hash = '#/apply';
    renderApp();
    await vi.waitFor(() => expect(topTab('Apply')).toHaveAccessibleName('Apply 2'));
    act(() => setPipelineView({ filter: 'closed' }));
    expect(topTab('Apply')).toHaveAccessibleName('Apply 2');
    act(() => setPipelineView({ filter: 'applied' }));
    expect(topTab('Apply')).toHaveAccessibleName('Apply 2');
  });

  it('no count while it is 0 or not known yet (Find before Review new has read)', async () => {
    window.location.hash = '#/apply';
    renderApp();
    // The count's chunk has landed: a job added now shows at once.
    addJob('https://acme.example/jobs/3', 'Design Engineer');
    await vi.waitFor(() => expect(topTab('Apply')).toHaveAccessibleName('Apply 1'));
    expect(topTab('Find')).toHaveAccessibleName('Find');
    expect(topTab('Find').textContent).toBe('Find');
  });
});
