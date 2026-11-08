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
import { addDeviceDataIfAsked } from './test/renderAccount';
import { loadSupabase } from './supabase';
import { ColorModeProvider } from './ColorMode';
import App from './App';
import { QUICK_ADD_INVALID } from './saveNotice';
import { addStarterMessages } from './addStarters';
import { BRAND } from './brand';
import { addJob, getAllJobs, removeJob } from './store';
import { OFFLINE_MSG } from './cloudMessages';
import { backInFlight, resetHistoryRecord } from './route';
import { CONTACT_EMAIL, LEGAL_DRAFT } from './legal';
import { currentTab, topTab, topTabs } from './test/topTabs';

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

// The Supabase client loads lazily (supabase.ts); load it as a sign-in would, so `fake()` exists.
beforeEach(async () => {
  await loadSupabase();
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
    expect(screen.getByRole('img', { name: BRAND.name })).toBeInTheDocument();
    expect(topTabs().map((t) => t.textContent)).toEqual(['Find', 'Apply']);
    expect(screen.getByRole('button', { name: /^Account/ })).toBeInTheDocument();
    // The old header controls are gone: no separate theme toggle or 1-item overflow menu.
    expect(screen.queryByRole('button', { name: /Switch to (dark|light) mode/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'More options' })).toBeNull();
  });

  it('has landmarks: a banner with the wordmark, account and tabs, and one main with the page', () => {
    window.location.hash = '#/apply';
    renderApp();
    // A page's own <header> inside main is not a banner (testing-library counts it; axe doesn't).
    const banners = screen.getAllByRole('banner').filter((el) => !el.closest('main'));
    expect(banners).toHaveLength(1);
    const banner = banners[0];
    // The wordmark names the product, not the page (#363): it is no heading; the page's own name
    // is the one h1, inside main.
    expect(within(banner).getByRole('img', { name: BRAND.name })).toBeInTheDocument();
    expect(within(banner).queryByRole('heading')).toBeNull();
    expect(within(banner).getByRole('navigation', { name: 'Sections' })).toBeInTheDocument();
    expect(within(banner).getByRole('button', { name: /^Account/ })).toBeInTheDocument();
    const mains = screen.getAllByRole('main');
    expect(mains).toHaveLength(1);
    expect(within(mains[0]).getByRole('heading', { level: 1, name: 'Apply' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('Documents is a dialog over the page, never a page of its own (#471 slice 4)', async () => {
    window.location.hash = '#/copy-deck';
    renderApp();
    expect(await screen.findByRole('dialog', { name: 'Documents' })).toBeInTheDocument();
    // The page under it keeps its own h1 in main.
    expect(
      within(screen.getByRole('main', { hidden: true })).getByRole('heading', {
        level: 1,
        name: 'Find',
        hidden: true,
      }),
    ).toBeInTheDocument();
  });

  // The animated logo (src/brand/RoleFlame.tsx) loads lazily behind the still wordmark.
  const animatedLogo = async () => {
    await waitFor(() => expect(document.querySelector('header .rjb-rf')).not.toBeNull());
    return screen.getByRole('img', { name: BRAND.name });
  };

  it('the wordmark is the brand lockup at 19px, never a page-title step', async () => {
    renderApp();
    const wordmark = await animatedLogo();
    expect(wordmark).toHaveClass('rjb-rf');
    expect(wordmark.className).not.toMatch(/hds-type-(title|display)/);
    expect(wordmark.style.getPropertyValue('--rjb-rf-size')).toBe('19px');
    expect((wordmark.parentElement as HTMLElement).style.getPropertyValue('--rjb-logo-size')).toBe(
      '19px',
    );
  });

  it('the flame leads the wordmark, hidden from assistive tech', async () => {
    renderApp();
    const wordmark = await animatedLogo();
    const mark = wordmark.firstElementChild as Element;
    expect(mark.tagName.toLowerCase()).toBe('svg');
    expect(mark.getAttribute('aria-hidden')).toBe('true');
    expect(mark.querySelector('path')).not.toBeNull();
    expect(wordmark.lastElementChild).toHaveTextContent(BRAND.name);
  });

  it('signed out, the account menu reads: device-only line, sign in | data | display | troubleshooting', async () => {
    renderApp();
    const menu = await openAccount();
    expect(menuOutline(menu)).toEqual([
      'label:Saved on this device only',
      'item:Sign in to sync…',
      '---',
      'item:Documents',
      'item:Search profile',
      'item:Companies',
      'item:Scan details',
      'item:Back up',
      'item:Restore…',
      'item:Export CSV',
      'item:Export links',
      '---',
      expect.stringMatching(/^item:(Dark|Light) theme$/),
      // WCAG 2.2.2 (#516): the app bar's flame loops on; this stops it.
      expect.stringMatching(/^item:(Pause|Play) animations$/),
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
    // The safety copy still describes the dialog (body text inside HDS's description, not a caption).
    expect(dialog).toHaveAccessibleDescription(/This deletes everything in this browser/);
    // HDS's Description already renders a <p>: the body copy sits in it as a span, never a second
    // <p> (invalid nesting, a dev console error) and never an `asChild` leaking onto the DOM.
    expect(dialog.querySelector('p p')).toBeNull();
    expect(dialog.querySelector('[aschild]')).toBeNull();
    const description = within(dialog).getByText(/This deletes everything in this browser/);
    expect(description.tagName).toBe('SPAN');
    expect(description).toHaveClass('hds-type-body');
    // The app's one destructive style: HDS secondary + tone="danger" (its tinted fill).
    const reset = within(dialog).getByRole('button', { name: 'Reset local data' });
    expect(reset).toHaveClass('bg-feedback-bg-danger', 'text-feedback-danger');
    expect(reset).not.toHaveClass('rjb-danger-outline');
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
    window.location.hash = '#/apply';
    renderApp();
    const panel = screen.getByRole('main');
    for (const name of ['Back up', 'Restore…', 'Export CSV'])
      expect(within(panel).queryByRole('button', { name })).toBeNull();
  });

  it('Pause animations (WCAG 2.2.2) is kept on this device and the item says Play after', async () => {
    localStorage.removeItem('rjb_ui_pause_motion');
    renderApp();
    let menu = await openAccount();
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Pause animations' }));
    expect(localStorage.getItem('rjb_ui_pause_motion')).toBe('1');
    menu = await openAccount();
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Play animations' }));
    expect(localStorage.getItem('rjb_ui_pause_motion')).toBe('0');
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
    // The backup format loads on demand (#371).
    await waitFor(() =>
      expect(name).toMatch(new RegExp(`^${BRAND.slug}-backup-\\d{4}-\\d{2}-\\d{2}\\.json$`)),
    );
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

describe('not-synced cue (Adrian 2026-10-22: no dot on the Account avatar)', () => {
  beforeEach(() => {
    window.location.hash = '#/apply';
  });

  // Jobs saved only here: the menu's sync line says so; the avatar stays plain.
  beforeEach(() => {
    addJob('https://acme.example/jobs/1', 'Design Engineer');
  });

  it('signed out with jobs, the avatar is plain "Account" on every route; no banner', async () => {
    for (const hash of ['#/apply', '#/find']) {
      window.location.hash = hash;
      const { unmount } = renderApp();
      const account = await screen.findByRole('button', { name: 'Account' });
      expect(account).not.toHaveAttribute('title');
      expect(screen.queryByRole('button', { name: 'Account, not synced' })).toBeNull();
      expect(screen.queryByRole('region', { name: 'Sync your data' })).toBeNull();
      unmount();
    }
  });

  it('signed in while sync is failing, the avatar still has no dot', async () => {
    fake().failNext('tracker', 'select');
    renderApp();
    act(() => fake().signIn('u1'));
    await addDeviceDataIfAsked();
    expect(await screen.findByText(OFFLINE_MSG)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Account' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Account, not synced' })).toBeNull();
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
    await addDeviceDataIfAsked();
    const account = await screen.findByRole('button', { name: 'Account' });
    await waitFor(() => expect(account.textContent).toBe('U'));
    const menu = await openAccount();
    await within(menu).findByText('Synced');
    expect(menuOutline(menu)).toEqual([
      'label:Signed in as u1@example.test',
      'label:Synced',
      '---',
      'item:Documents',
      'item:Search profile',
      'item:Companies',
      'item:Scan details',
      'item:Back up',
      'item:Restore…',
      'item:Export CSV',
      'item:Export links',
      '---',
      expect.stringMatching(/^item:(Dark|Light) theme$/),
      // WCAG 2.2.2 (#516): the app bar's flame loops on; this stops it.
      expect.stringMatching(/^item:(Pause|Play) animations$/),
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
    await addDeviceDataIfAsked();
    expect(await screen.findByText(OFFLINE_MSG)).toBeInTheDocument();
    const menu = await openAccount();
    expect(within(menu).getByRole('menuitem', { name: 'Retry sync' })).toBeInTheDocument();
  });
});

describe('routes keep working (#115 Phase 1)', () => {
  it.each([
    ['#/apply', 'Apply'],
    ['#/discover', 'Find'],
    ['#/find', 'Find'],
    ['', 'Find'],
  ])('%s selects %s', (hash, tab) => {
    window.location.hash = hash;
    renderApp();
    expect(currentTab()).toHaveAccessibleName(tab);
  });

  it('#/copy-deck opens the Documents dialog over Find, its tab selected (#240, #227, #471)', async () => {
    window.location.hash = '#/copy-deck';
    renderApp();
    expect(await screen.findByRole('dialog', { name: 'Documents' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Templates', hidden: true })).toBeNull();
    expect(currentTab(undefined, { hidden: true })).toHaveAccessibleName('Find');
    await waitFor(() => expect(window.location.hash).toBe('#/find?documents='));
  });

  it('#/copy-deck/<id> still opens that template, now an Outreach message (#240, #227)', async () => {
    addStarterMessages(); // a clean first run has none (Adrian 2026-10-22)
    window.location.hash = '#/copy-deck/tpl-cover';
    renderApp();
    expect(await screen.findByRole('textbox', { name: 'Title' })).toHaveValue('Cover letter');
    await waitFor(() => expect(window.location.hash).toBe('#/find?documents=snippet-tpl-cover'));
  });

  it('the Menu opens Documents over the page it was opened from (#240, #227, #471)', async () => {
    renderApp();
    const menu = await openAccount();
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Documents' }));
    await waitFor(() => expect(window.location.hash).toBe('#/find?documents='));
    expect(await screen.findByRole('dialog', { name: 'Documents' })).toBeInTheDocument();
    // The browser's Back closes it and stays on Find.
    window.history.back();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(window.location.hash).toBe('#/find');
  });

  it('the Menu opens Privacy and terms: one dialog with two tabs (#43, #471)', async () => {
    renderApp();
    const menu = await openAccount();
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Privacy and terms' }));
    await waitFor(() => expect(window.location.hash).toBe('#/find?legal=privacy'));
    const dialog =
      // Past its loading frame (DialogHold): the dialog with its tabs.
      (await screen.findByRole('tablist', { name: 'Privacy and terms' })).closest(
        '[role="dialog"]',
      ) as HTMLElement;
    expect(
      within(dialog).getByRole('tab', { name: 'Privacy policy', selected: true }),
    ).toBeInTheDocument();
  });

  it('#/legal/terms opens the dialog on Terms; the tabs swap in place; Close returns (#43, #471)', async () => {
    window.location.hash = '#/legal/terms';
    renderApp();
    const dialog =
      // Past its loading frame (DialogHold): the dialog with its tabs.
      (await screen.findByRole('tablist', { name: 'Privacy and terms' })).closest(
        '[role="dialog"]',
      ) as HTMLElement;
    expect(
      within(dialog).getByRole('tab', { name: 'Terms of use', selected: true }),
    ).toBeInTheDocument();
    await waitFor(() => expect(window.location.hash).toBe('#/find?legal=terms'));
    const length = window.history.length;
    await userEvent.click(within(dialog).getByRole('tab', { name: 'Privacy policy' }));
    await waitFor(() => expect(window.location.hash).toBe('#/find?legal=privacy'));
    expect(window.history.length).toBe(length);
    // Approved wording carries its date and no notice; a revision under review says it is a draft.
    if (LEGAL_DRAFT) {
      expect(screen.getByText(/^Draft of/)).toBeInTheDocument();
      expect(screen.getByText(/This is a draft under review/)).toBeInTheDocument();
    } else {
      expect(screen.getByText(/^Last updated/)).toBeInTheDocument();
      expect(screen.queryByText(/This is a draft under review/)).toBeNull();
    }
    expect(within(dialog).getAllByRole('link', { name: CONTACT_EMAIL })[0]).toHaveAttribute(
      'href',
      `mailto:${CONTACT_EMAIL}`,
    );
    await userEvent.click(within(dialog).getByRole('button', { name: /Close/ }));
    await waitFor(() => expect(window.location.hash).toBe('#/find'));
  });

  it('a ?add= quick-add link lands on the Pipeline with the job saved', async () => {
    window.history.replaceState(null, '', '/?add=https://acme.example/jobs/9&t=Design%20Engineer');
    renderApp();
    expect(window.location.hash).toBe('#/apply');
    expect(currentTab()).toHaveAccessibleName('Apply');
    expect(getAllJobs().map((j) => j.url)).toContain('https://acme.example/jobs/9');
  });

  it('a ?add= quick-add link says where the job went (the landing does not drop the notice)', async () => {
    window.history.replaceState(null, '', '/?add=https://acme.example/jobs/9');
    renderApp();
    expect(await screen.findByText('Saved to Pipeline · To apply')).toBeInTheDocument();
  });

  it('a quick-add link that is not a web link says so instead of landing in silence', async () => {
    window.history.replaceState(null, '', '/?add=nonsense');
    renderApp();
    expect(await screen.findByText(QUICK_ADD_INVALID)).toBeInTheDocument();
    expect(window.location.search).toBe('');
    expect(getAllJobs()).toHaveLength(0);
  });

  it('an ?applied= link marks a job saved under another form of its link (www, trailing slash)', () => {
    addJob('https://acme.example/jobs/9/');
    window.history.replaceState(null, '', '/?applied=https://www.acme.example/jobs/9');
    renderApp();
    expect(getAllJobs()).toHaveLength(1);
    expect(getAllJobs()[0].status).toBe('Applied');
  });

  it('an ?applied= link says what it did, with Open (#333)', async () => {
    window.history.replaceState(null, '', '/?applied=https://acme.example/jobs/9&t=Designer');
    renderApp();
    expect(await screen.findByText('Marked applied')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument();
    expect(window.location.search).toBe('');
    expect(getAllJobs()[0].status).toBe('Applied');
  });

  it('a ?status= link says what it did, with Open (#333)', async () => {
    window.history.replaceState(null, '', '/?status=Interviewing&u=https://acme.example/jobs/9');
    renderApp();
    expect(await screen.findByText('Set to Interviewing')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument();
    expect(window.location.search).toBe('');
    expect(window.location.hash).toBe('#/apply');
    expect(getAllJobs()[0].status).toBe('Interviewing');
  });

  it('a ?status= link with an unknown status says so and leaves no params behind (#333)', async () => {
    window.history.replaceState(
      null,
      '',
      '/?status=Bogus&u=https://acme.example/jobs/9&keep=1#/apply',
    );
    renderApp();
    expect(await screen.findByText(/“Bogus” is not a status/)).toBeInTheDocument();
    expect(window.location.search).toBe('?keep=1');
    expect(window.location.hash).toBe('#/apply');
    expect(getAllJobs()).toHaveLength(0);
  });

  it('a ?status= link with no job link says so and leaves no params behind (#333)', async () => {
    window.history.replaceState(null, '', '/?status=Applied');
    renderApp();
    expect(await screen.findByText(QUICK_ADD_INVALID)).toBeInTheDocument();
    expect(window.location.search).toBe('');
    expect(getAllJobs()).toHaveLength(0);
  });

  it('an empty ?add= or ?applied= says so too (#333)', async () => {
    window.history.replaceState(null, '', '/?applied=&t=Designer');
    renderApp();
    expect(await screen.findByText(QUICK_ADD_INVALID)).toBeInTheDocument();
    expect(window.location.search).toBe('');
  });

  it('Undo on a ?status= notice removes the job the link saved (#333)', async () => {
    window.history.replaceState(null, '', '/?status=Offer&u=https://acme.example/jobs/9');
    renderApp();
    await screen.findByText('Set to Offer');
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(getAllJobs()).toHaveLength(0);
  });

  it('Undo on an ?applied= notice puts an already-saved job back as it was (#333)', async () => {
    addJob('https://acme.example/jobs/9');
    window.history.replaceState(null, '', '/?applied=https://acme.example/jobs/9');
    renderApp();
    await screen.findByText('Marked applied');
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(getAllJobs()[0].status).toBe('Saved');
  });

  it('a lone ?t= or ?u= is cleaned from the URL too (#333)', () => {
    window.history.replaceState(null, '', '/?t=Designer&u=https://acme.example/jobs/9');
    renderApp();
    expect(window.location.search).toBe('');
  });

  it('an expired sign-in link says so in a toast and leaves no error in the URL', async () => {
    await act(() => new Promise((r) => setTimeout(r, 0)));
    window.history.replaceState(
      null,
      '',
      '/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
    );
    resetHistoryRecord();
    const before = window.history.length;
    renderApp();
    expect(
      await screen.findByText('That sign-in link has expired. Send a new one from Account.'),
    ).toBeInTheDocument();
    expect(window.location.hash).toBe('#/find');
    expect(window.location.href).not.toMatch(/error/);
    expect(window.history.length).toBe(before); // replaced: Back doesn't return to the error
    expect(currentTab()).toHaveAccessibleName('Find');
  });

  it('a cancelled Google sign-in says so and leaves no error in the URL, query or hash (#482)', async () => {
    await act(() => new Promise((r) => setTimeout(r, 0)));
    window.history.replaceState(
      null,
      '',
      '/?error=access_denied&error_code=access_denied&error_description=The+user+denied#/apply',
    );
    resetHistoryRecord();
    renderApp();
    expect(await screen.findByText('Google sign-in was cancelled.')).toBeInTheDocument();
    expect(window.location.search).toBe('');
    expect(window.location.hash).toBe('#/find');
  });

  it('after a quick-add link, a sheet closing and a tab move at once (the URL goes through the route)', async () => {
    // A fresh load of the link: the hashchange from beforeEach has run, and the route module
    // starts its record on the URL the browser opened.
    await act(() => new Promise((r) => setTimeout(r, 0)));
    window.history.replaceState(null, '', '/?add=https://acme.example/jobs/9');
    resetHistoryRecord();
    renderApp();
    expect(window.location.search).toBe('');
    expect(window.location.hash).toBe('#/apply');
    await openAccount();
    await userEvent.keyboard('{Escape}');
    // The menu's entry pops at once: the route knows the hash it is on, so it doesn't wait ~2 s
    // for a hashchange that never comes.
    await waitFor(() => expect(backInFlight()).toBe(false), { timeout: 500 });
    await userEvent.click(topTab('Find'));
    await waitFor(() => expect(window.location.hash).toBe('#/find'), { timeout: 500 });
  });
});
