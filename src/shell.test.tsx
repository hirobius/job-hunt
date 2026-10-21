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
  await userEvent.click(screen.getByRole('button', { name: /^Account/ }));
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
    expect(tabs.map((t) => t.textContent)).toEqual(['Companies', 'Pipeline']);
    expect(screen.getByRole('button', { name: /^Account/ })).toBeInTheDocument();
    // The old header controls are gone: no separate theme toggle or 1-item overflow menu.
    expect(screen.queryByRole('button', { name: /Switch to (dark|light) mode/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'More options' })).toBeNull();
  });

  it('the wordmark is an app-bar label, smaller than any page title', () => {
    renderApp();
    const wordmark = screen.getByRole('heading', { level: 1, name: BRAND.name });
    // rev-3 .brand: the display family on the titleSm step, under the title step a page head uses.
    expect(wordmark.className).not.toMatch(/hds-type-(title|display)(?!-sm)\b/);
    expect(wordmark.className).toMatch(/hds-type-title-sm/);
  });

  it('signed out, the account menu reads: device-only line, sign in | data | display | troubleshooting', async () => {
    renderApp();
    const menu = await openAccount();
    expect(menuOutline(menu)).toEqual([
      'label:Saved on this device only',
      'item:Sign in to sync…',
      '---',
      'item:Documents',
      'item:Back up',
      'item:Restore…',
      'item:Export CSV',
      '---',
      expect.stringMatching(/^item:(Dark|Light) theme$/),
      'item:Send feedback',
      'item:Privacy and terms',
      '---',
      'item:Reload app',
      'item:Reset local data…',
    ]);
  });

  it('Reset local data asks first and says what goes; Cancel keeps everything (rev-3 O)', async () => {
    addJob('https://acme.example/jobs/9', 'Welder');
    renderApp();
    const menu = await openAccount();
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Reset local data…' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Reset local data?' });
    expect(dialog).toHaveTextContent(/This deletes everything in this browser: 1 job/);
    expect(within(dialog).getByRole('button', { name: 'Back up first' })).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(getAllJobs().map((j) => j.label)).toContain('Welder');
    // Focus goes back to the Account button, not <body> (QA: the menu is non-modal and the
    // confirm has no trigger of its own).
    await waitFor(() => expect(screen.getByRole('button', { name: /^Account/ })).toHaveFocus());
  });

  it('Escape on Reset, and closing Sign in, both hand focus back to the Account button', async () => {
    renderApp();
    let menu = await openAccount();
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Reset local data…' }));
    await screen.findByRole('alertdialog', { name: 'Reset local data?' });
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.getByRole('button', { name: /^Account/ })).toHaveFocus());
    menu = await openAccount();
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Sign in to sync…' }));
    await screen.findByRole('dialog', { name: 'Sign in' });
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.getByRole('button', { name: /^Account/ })).toHaveFocus());
  });

  it('the trigger is the HDS Avatar (rev-3 P): a person icon signed out, no dot with nothing to sync', async () => {
    renderApp();
    const account = await screen.findByRole('button', { name: 'Account' });
    expect(account.textContent?.trim()).toBe('');
    expect(account.querySelector('svg')).not.toBeNull();
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

describe('not-synced cue (rev-3 P)', () => {
  beforeEach(() => {
    window.location.hash = '#/queue';
  });

  // The cue says jobs live only here, so it needs some.
  beforeEach(() => {
    addJob('https://acme.example/jobs/1', 'Design Engineer');
  });

  it('is not shown on a first visit with nothing to sync', async () => {
    removeJob('https://acme.example/jobs/1');
    renderApp();
    await screen.findByRole('button', { name: 'Account' });
    await new Promise((r) => setTimeout(r, 0)); // let the session check settle
    expect(screen.queryByRole('button', { name: 'Account, not synced' })).toBeNull();
  });

  it('signed out with jobs, the Account avatar carries it on every route; no banner', async () => {
    for (const hash of ['#/queue', '#/copy-deck']) {
      window.location.hash = hash;
      const { unmount } = renderApp();
      const account = await screen.findByRole('button', { name: 'Account, not synced' });
      expect(account).toHaveAttribute('title', 'Saved on this device only');
      expect(screen.queryByRole('region', { name: 'Sync your data' })).toBeNull();
      unmount();
    }
  });

  it('Sign in to sync in the menu opens a dialog with the email field', async () => {
    renderApp();
    const menu = await openAccount();
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Sign in to sync…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Sign in' });
    expect(within(dialog).getByRole('textbox', { name: /email/i })).toBeInTheDocument();
  });

  it('signed in, the avatar shows your initial with no dot, and the menu the sync status', async () => {
    renderApp();
    act(() => fake().signIn('u1'));
    const account = await screen.findByRole('button', { name: 'Account' });
    await waitFor(() => expect(account.textContent).toBe('U'));
    const menu = await openAccount();
    await within(menu).findByText('Synced');
    expect(menuOutline(menu)).toEqual([
      'label:Signed in as u1@example.test',
      'label:Synced',
      '---',
      'item:Documents',
      'item:Back up',
      'item:Restore…',
      'item:Export CSV',
      '---',
      expect.stringMatching(/^item:(Dark|Light) theme$/),
      'item:Send feedback',
      'item:Privacy and terms',
      '---',
      'item:Reload app',
      'item:Reset local data…',
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
    ['#/discover', 'Companies'],
    ['', 'Companies'],
  ])('%s selects %s', (hash, tab) => {
    window.location.hash = hash;
    renderApp();
    expect(screen.getByRole('tab', { selected: true })).toHaveAccessibleName(tab);
  });

  it('#/copy-deck is a page with no tab selected: a Documents heading and a way back (#240, #227)', async () => {
    window.location.hash = '#/copy-deck';
    renderApp();
    expect(screen.queryByRole('tab', { name: 'Templates' })).toBeNull();
    expect(screen.queryByRole('tab', { selected: true })).toBeNull();
    expect(await screen.findByRole('heading', { level: 2, name: 'Documents' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Pipeline' })).toHaveAttribute(
      'href',
      '#/queue',
    );
  });

  it.each(['#/copy-deck', '#/legal/privacy'])(
    'on %s, tabbing past the Menu onto a tab does not leave the page (a11y pass)',
    async (hash) => {
      window.location.hash = hash;
      renderApp();
      await screen.findByRole('heading', { level: 2 });
      const user = userEvent.setup();
      screen.getByRole('button', { name: /^Account/ }).focus();
      await user.tab();
      expect(screen.getByRole('tab', { name: 'Companies' })).toHaveFocus();
      expect(window.location.hash).toBe(hash);
      // Enter still opens it.
      await user.keyboard('{Enter}');
      await waitFor(() => expect(window.location.hash).toBe('#/discover'));
    },
  );

  it('#/copy-deck/<id> still opens that template, now an Outreach message (#240, #227)', async () => {
    window.location.hash = '#/copy-deck/tpl-cover';
    renderApp();
    expect(await screen.findByRole('textbox', { name: 'Title' })).toHaveValue('Cover letter');
    const sections = screen.getByRole('tablist', { name: 'Sections' });
    expect(within(sections).queryByRole('tab', { selected: true })).toBeNull();
  });

  it('the Menu opens Documents (#240, #227)', async () => {
    renderApp();
    const menu = await openAccount();
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Documents' }));
    expect(window.location.hash).toBe('#/copy-deck');
    expect(await screen.findByRole('heading', { level: 2, name: 'Documents' })).toBeInTheDocument();
  });

  it('the Menu opens Privacy and terms: a page with no tab selected (#43)', async () => {
    renderApp();
    const menu = await openAccount();
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Privacy and terms' }));
    expect(window.location.hash).toBe('#/legal/privacy');
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Privacy policy' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('tab', { selected: true })).toBeNull();
  });

  it('#/legal/terms shows the Terms, links to the policy and back to the app (#43)', async () => {
    window.location.hash = '#/legal/terms';
    renderApp();
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Terms of use' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Privacy policy' })).toHaveAttribute(
      'href',
      '#/legal/privacy',
    );
    expect(screen.getByRole('link', { name: 'Back to Companies' })).toHaveAttribute(
      'href',
      '#/discover',
    );
    // The wording is approved (2026-10-20): the page carries its date and no draft notice.
    expect(screen.getByText(/^Last updated/)).toBeInTheDocument();
    expect(screen.queryByText(/This is a draft under review/)).toBeNull();
    expect(screen.getByRole('link', { name: 'hello@hirobius.com' })).toHaveAttribute(
      'href',
      'mailto:hello@hirobius.com',
    );
  });

  it('a ?add= quick-add link lands on the Pipeline with the job saved', async () => {
    window.history.replaceState(null, '', '/?add=https://acme.example/jobs/9&t=Design%20Engineer');
    renderApp();
    expect(window.location.hash).toBe('#/queue');
    expect(screen.getByRole('tab', { selected: true })).toHaveAccessibleName('Pipeline');
    expect(getAllJobs().map((j) => j.url)).toContain('https://acme.example/jobs/9');
  });
});
