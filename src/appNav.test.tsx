import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

// CloudSync instantiates a Supabase client at module load; stub it so App can render in jsdom
// without any network or real config. We only need the auth listener + a no-op query surface.
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
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

import { ColorModeProvider } from './ColorMode';
import App from './App';

beforeEach(() => {
  window.location.hash = '';
});
afterEach(() => {
  cleanup();
  window.location.hash = '';
});

const renderApp = () => render(<ColorModeProvider>{<App />}</ColorModeProvider>);

describe('App top-level tab wiring', () => {
  it('renders four tabs, each associated with a tabpanel', () => {
    renderApp();
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(4);
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

  it('defaults to the Queue tab when the hash carries no route', () => {
    renderApp();
    expect(screen.getByRole('tab', { selected: true })).toHaveAccessibleName(/queue/i);
  });
});
