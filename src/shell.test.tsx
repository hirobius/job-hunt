// Phase 1 of the redesign (#115): the app shell. Rendered through App at the route seam and
// driven by role + name — slim header, top tabs, one account menu for every data control, a
// one-time sync nudge, and the old routes / quick-add links still landing where they did.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@hirobius/design-system';

const h = vi.hoisted(() => ({ fake: null as null | ReturnType<typeof createFakeSupabase> }));
vi.mock('@supabase/supabase-js', async () => {
  const { createFakeSupabase } = await import('./test/fakeSupabase');
  return {
    createClient: () => {
      h.fake = createFakeSupabase();
      return h.fake.client;
    },
  };
});

import { createFakeSupabase } from './test/fakeSupabase';
import { ColorModeProvider } from './ColorMode';
import App from './App';
import { BRAND } from './brand';
import { addJob, getAllJobs, removeJob } from './store';
import { OFFLINE_MSG } from './cloudMessages';

const fake = () => h.fake!;

const renderApp = () =>
  render(
    <ColorModeProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ColorModeProvider>,
  );

// The open menu top to bottom: header lines (labels, not focusable), items and separators.
const menuOutline = (menu: HTMLElement) =>
  Array.from(
    menu.querySelectorAll('[role="menuitem"], [role="separator"], [data-account-line]'),
  ).map((el) =>
    el.getAttribute('role') === 'separator'
      ? '---'
      : `${el.getAttribute('role') === 'menuitem' ? 'item' : 'label'}:${el.textContent?.trim()}`,
  );

const openAccount = async () => {
  await userEvent.click(screen.getByRole('button', { name: 'Menu' }));
  return screen.findByRole('menu');
};

beforeEach(() => {
  fake().reset();
  localStorage.clear();
  window.location.hash = '';
  window.history.replaceState(null, '', '/');
});
afterEach(() => {
  cleanup();
  getAllJobs()
    .slice()
    .forEach((j) => removeJob(j.url));
  vi.restoreAllMocks();
});

describe('app shell (#115 Phase 1)', () => {
  it('has a slim header: the product name, the top tabs and one account menu', () => {
    renderApp();
    expect(screen.getByRole('heading', { level: 1, name: BRAND.name })).toBeInTheDocument();
    const tabs = within(screen.getByRole('tablist')).getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Today', 'Pipeline', 'Discover', 'Templates']);
    expect(screen.getByRole('button', { name: 'Menu' })).toBeInTheDocument();
    // The old header controls are gone: no separate theme toggle or 1-item overflow menu.
    expect(screen.queryByRole('button', { name: /Switch to (dark|light) mode/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'More options' })).toBeNull();
  });

  it('the wordmark is an app-bar label, smaller than any page title', () => {
    renderApp();
    const wordmark = screen.getByRole('heading', { level: 1, name: BRAND.name });
    expect(wordmark.className).not.toMatch(/hds-type-(title|display)/);
    expect(wordmark.className).toMatch(/hds-type-(body|ui)/);
  });

  it('signed out, the account menu reads: device-only line, sign in | data | display', async () => {
    renderApp();
    const menu = await openAccount();
    expect(menuOutline(menu)).toEqual([
      'label:Saved on this device only',
      'item:Sign in to sync…',
      '---',
      'item:Back up',
      'item:Restore…',
      'item:Export CSV',
      '---',
      expect.stringMatching(/^item:(Dark|Light) theme$/),
      expect.stringMatching(/^item:(Compact|Comfortable) spacing$/),
      'item:Send feedback',
    ]);
  });

  it('the trigger is an icon-only "Menu" button: no word, no unsynced dot', async () => {
    addJob('https://acme.example/jobs/dot', 'Design Engineer');
    window.location.hash = '#/queue';
    renderApp();
    const account = await screen.findByRole('button', { name: 'Menu' });
    expect(account).toHaveAttribute('aria-label', 'Menu');
    expect(account.textContent?.trim()).toBe('');
    expect(account.querySelector('svg')).not.toBeNull();
    expect(account.querySelector('[class*="dot"]')).toBeNull();
  });

  it('data controls left the Pipeline toolbar', () => {
    window.location.hash = '#/queue';
    renderApp();
    const panel = screen.getByRole('tabpanel');
    for (const name of ['Back up', 'Restore…', 'Export CSV'])
      expect(within(panel).queryByRole('button', { name })).toBeNull();
  });

  it('the theme item flips the colour mode', async () => {
    renderApp();
    const before = document.documentElement.dataset.theme;
    const menu = await openAccount();
    await userEvent.click(within(menu).getByRole('menuitem', { name: /theme$/ }));
    expect(document.documentElement.dataset.theme).not.toBe(before);
  });

  it('Back up in the menu downloads a backup file', async () => {
    let name = '';
    URL.createObjectURL = vi.fn(() => 'blob:test');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      name = this.download;
    });
    renderApp();
    const menu = await openAccount();
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Back up' }));
    expect(name).toMatch(new RegExp(`^${BRAND.slug}-backup-\\d{4}-\\d{2}-\\d{2}\\.json$`));
  });

  it('a bad restore file is reported as a toast', async () => {
    renderApp();
    await userEvent.upload(
      screen.getByLabelText('Choose a backup file to restore'),
      new File(['{"nope":1}'], 'x.json', { type: 'application/json' }),
    );
    expect(
      await screen.findByText(`This file isn't a backup from ${BRAND.name}.`),
    ).toBeInTheDocument();
  });
});

describe('sync nudge (#115 Phase 1)', () => {
  // The nudge offers to sync data, so it needs some.
  beforeEach(() => {
    addJob('https://acme.example/jobs/1', 'Design Engineer');
  });

  it('is not shown on a first visit with nothing to sync', async () => {
    removeJob('https://acme.example/jobs/1');
    renderApp();
    await screen.findByRole('button', { name: 'Menu' });
    await new Promise((r) => setTimeout(r, 0)); // let the session check settle
    expect(screen.queryByRole('region', { name: 'Sync your data' })).toBeNull();
  });

  it('signed out, a one-time callout offers sync instead of a sign-in form', async () => {
    renderApp();
    const nudge = await screen.findByRole('region', { name: 'Sync your data' });
    expect(within(nudge).getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /email/i })).toBeNull();
  });

  it('is a Today-only row; elsewhere the Account trigger carries a not-synced cue (#133)', async () => {
    window.location.hash = '#/queue';
    renderApp();
    const account = await screen.findByRole('button', { name: 'Menu' });
    expect(screen.queryByRole('region', { name: 'Sync your data' })).toBeNull();
    expect(account).toHaveAttribute('title', 'Saved on this device only');
  });

  it('dismissing it is remembered', async () => {
    const { unmount } = renderApp();
    const nudge = await screen.findByRole('region', { name: 'Sync your data' });
    await userEvent.click(within(nudge).getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('region', { name: 'Sync your data' })).toBeNull();
    unmount();
    renderApp();
    await screen.findByRole('button', { name: 'Menu' });
    await new Promise((r) => setTimeout(r, 0)); // let the session check settle
    expect(screen.queryByRole('region', { name: 'Sync your data' })).toBeNull();
  });

  it('Sign in opens a dialog with the email field', async () => {
    renderApp();
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in' }));
    const dialog = await screen.findByRole('dialog', { name: 'Sign in to sync' });
    expect(within(dialog).getByRole('textbox', { name: /email/i })).toBeInTheDocument();
  });

  it('signed in, the nudge is gone and the menu shows the sync status', async () => {
    renderApp();
    act(() => fake().signIn('u1'));
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Sync your data' })).toBeNull(),
    );
    const menu = await openAccount();
    await within(menu).findByText('Synced');
    expect(menuOutline(menu)).toEqual([
      'label:Signed in as u1@example.test',
      'label:Synced',
      '---',
      'item:Back up',
      'item:Restore…',
      'item:Export CSV',
      '---',
      expect.stringMatching(/^item:(Dark|Light) theme$/),
      expect.stringMatching(/^item:(Compact|Comfortable) spacing$/),
      'item:Send feedback',
      '---',
      'item:Sign out',
      'item:Delete my data',
    ]);
    // The email is plain text: not a link, not a menu item, not focusable.
    expect(within(menu).queryAllByRole('link')).toEqual([]);
    const email = within(menu).getByText('Signed in as u1@example.test');
    expect(email.closest('a, [role="menuitem"]')).toBeNull();
    expect(email).not.toHaveAttribute('tabindex');
  });

  it('a failed sync is a toast, with Retry in the account menu', async () => {
    fake().failNext('tracker', 'select');
    renderApp();
    act(() => fake().signIn('u1'));
    expect(await screen.findByText(OFFLINE_MSG)).toBeInTheDocument();
    const menu = await openAccount();
    expect(within(menu).getByRole('menuitem', { name: 'Retry sync' })).toBeInTheDocument();
  });
});

describe('routes keep working (#115 Phase 1)', () => {
  it.each([
    ['#/queue', 'Pipeline'],
    ['#/discover', 'Discover'],
    ['#/copy-deck', 'Templates'],
    ['#/today', 'Today'],
    ['', 'Today'],
  ])('%s selects %s', (hash, tab) => {
    window.location.hash = hash;
    renderApp();
    expect(screen.getByRole('tab', { selected: true })).toHaveAccessibleName(tab);
  });

  it('a ?add= quick-add link lands on the Pipeline with the job saved', async () => {
    window.history.replaceState(null, '', '/?add=https://acme.example/jobs/9&t=Design%20Engineer');
    renderApp();
    expect(window.location.hash).toBe('#/queue');
    expect(screen.getByRole('tab', { selected: true })).toHaveAccessibleName('Pipeline');
    expect(getAllJobs().map((j) => j.url)).toContain('https://acme.example/jobs/9');
  });
});
