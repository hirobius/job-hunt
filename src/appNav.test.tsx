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
  it('renders two tabs (Companies · Pipeline), each associated with a tabpanel', () => {
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

  it('defaults to the Companies tab when the hash carries no route', () => {
    renderApp();
    expect(screen.getByRole('tab', { selected: true })).toHaveAccessibleName(/companies/i);
  });
});

describe('an unknown route (review nit)', () => {
  it('#/nope shows a not-found page with a way home, not Companies', async () => {
    window.location.hash = '#/nope';
    renderApp();
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    // No tab is selected and no tab panel mounts, like Documents.
    expect(screen.queryByRole('tab', { selected: true })).toBeNull();
    expect(screen.queryByRole('tabpanel')).toBeNull();
    screen.getByRole('button', { name: 'Go to Companies' }).click();
    await vi.waitFor(() => expect(window.location.hash).toBe('#/discover'));
  });

  // Supabase's email link signs in through the hash (implicit flow), and an expired or used link
  // comes back as #error=…. Neither is a route: Companies shows, and the hash is left for auth-js.
  it.each([
    '#access_token=a&refresh_token=b&expires_in=3600&token_type=bearer&type=magiclink',
    '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
  ])('a sign-in callback (%s) lands on Companies, not Page not found', (hash) => {
    window.location.hash = hash;
    renderApp();
    expect(screen.getByRole('tab', { name: 'Companies', selected: true })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Page not found' })).toBeNull();
    expect(window.location.hash).toBe(hash);
  });

  it('the old Trades slug (#/apprenticeships) still lands on Companies', () => {
    window.location.hash = '#/apprenticeships';
    renderApp();
    expect(screen.getByRole('tab', { name: 'Companies', selected: true })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Page not found' })).toBeNull();
  });
});
