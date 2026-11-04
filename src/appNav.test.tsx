import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

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
  it('renders two tabs (Today · Jobs), each associated with a tabpanel', () => {
    renderApp();
    const tabs = within(screen.getByRole('tablist', { name: 'Sections' })).getAllByRole('tab');
    expect(tabs).toHaveLength(2);
    for (const tab of tabs) {
      expect(tab.getAttribute('id')).toBeTruthy();
      expect(tab.getAttribute('aria-controls')).toBeTruthy();
    }
  });

  it('the selected tab points at the visible tabpanel both ways', () => {
    renderApp();
    const selected = screen.getByRole('tab', { selected: true });
    const panel = screen.getByRole('tabpanel');
    expect(selected.getAttribute('aria-controls')).toBe(panel.getAttribute('id'));
    expect(panel.getAttribute('aria-labelledby')).toBe(selected.getAttribute('id'));
  });

  it('the visible tabpanel is not a Tab stop (#364)', () => {
    renderApp();
    // Radix defaults the panel to tabindex=0; every page starts with a control,
    // so the panel stop is noise — the shell passes tabIndex={-1}.
    expect(screen.getByRole('tabpanel').getAttribute('tabindex')).toBe('-1');
  });

  it('defaults to the Today tab when the hash carries no route (#383)', () => {
    renderApp();
    expect(screen.getByRole('tab', { selected: true })).toHaveAccessibleName('Today');
  });
});

describe('an unknown route (review nit)', () => {
  it('#/nope shows a not-found page with a way home, not Today', async () => {
    window.location.hash = '#/nope';
    renderApp();
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    // No tab is selected and no tab panel mounts, like Documents.
    expect(screen.queryByRole('tab', { selected: true })).toBeNull();
    expect(screen.queryByRole('tabpanel')).toBeNull();
    screen.getByRole('button', { name: 'Go to Today' }).click();
    await vi.waitFor(() => expect(window.location.hash).toBe('#/today'));
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
    expect(screen.getByRole('tab', { name: 'Today', selected: true })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Page not found' })).toBeNull();
    expect(window.location.hash).toBe(kept === 'kept' ? hash : '#/today');
  });

  it('the old Trades slug (#/apprenticeships) still lands on home', () => {
    window.location.hash = '#/apprenticeships';
    renderApp();
    expect(screen.getByRole('tab', { name: 'Today', selected: true })).toBeInTheDocument();
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
      window.location.hash = '#/queue';
    });
    await act(async () => {
      window.location.hash = '#/queue/apply';
    });
    expect(document.querySelector('.rjb-view-enter')).toBe(stack);
    expect(marker.isConnected).toBe(true);

    // A page-kind change replays the motion by restarting the class on the same node.
    const removed = vi.spyOn(stack.classList, 'remove');
    await act(async () => {
      window.location.hash = '#/today';
    });
    expect(removed).toHaveBeenCalledWith('rjb-view-enter');
    expect(stack.classList.contains('rjb-view-enter')).toBe(true);
    expect(document.querySelector('.rjb-view-enter')).toBe(stack);
    expect(marker.isConnected).toBe(true);
  });
});
