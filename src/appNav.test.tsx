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

beforeEach(() => {
  window.location.hash = '';
});
afterEach(() => {
  cleanup();
  window.location.hash = '';
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
