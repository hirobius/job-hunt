// Followed and Ignored companies (simplify amendment 2, Q6): with the Companies tab gone, the
// Account menu's Companies item opens a small list of both. It is the Sources list: the boards
// and companies Review new reads, and the ones muted (Ignore / Not this company).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@hirobius/design-system';

vi.mock('@supabase/supabase-js', async () => {
  const { createFakeSupabase } = await import('./test/fakeSupabase');
  return { createClient: () => createFakeSupabase().client };
});

import { ColorModeProvider } from './ColorMode';
import App from './App';
import { saveProfile } from './profile';
import { addSources } from './sources';
import { followCompany, getAllDecided, muteCompany } from './feed/decided';
import { companiesLists } from './companiesList';
import { CompaniesDialog, SearchProfileDialog } from './lazyDialogs';
import { FIRST_ROWS } from './CompaniesDialog';
import type { Source } from './feed/profile';

describe('companiesLists', () => {
  const src = (label: string, o: Partial<Source> = {}): Source => ({
    kind: 'board',
    ref: `https://boards.greenhouse.io/${label.toLowerCase()}`,
    label,
    ...o,
  });

  it('followed: every board and company, once by name, A to Z; never a feed or a muted one', () => {
    const out = companiesLists(
      [
        src('Zeta'),
        src('acme'),
        src('Acme', { kind: 'company', ref: 'acme' }),
        src('Muted Co', { muted: true }),
        { kind: 'feed', ref: 'hn', label: 'Hacker News' },
      ],
      ['muted co'],
    );
    expect(out.followed.map((c) => c.label)).toEqual(['acme', 'Zeta']);
    expect(out.ignored.map((c) => c.label)).toEqual(['Muted Co']);
  });

  it('ignored: a muted name no Source knows is listed as stored', () => {
    expect(companiesLists([], ['forward']).ignored).toEqual([
      { key: 'forward', label: 'forward', known: false },
    ]);
  });
});

const renderApp = () =>
  render(
    <ColorModeProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ColorModeProvider>,
  );

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, '', '/');
  window.location.hash = '#/find';
});
afterEach(() => {
  cleanup();
});

describe('Account menu → Companies', () => {
  // The feedback rule (#212): the item answers within 300 ms, so its chunk is fetched when the
  // menu opens, not on the item's press.
  it('opening the Account menu starts fetching the Companies and Search profile chunks', async () => {
    const user = userEvent.setup();
    saveProfile({ titles: ['Design Systems Designer'], mode: 'remote' });
    const companies = vi.spyOn(CompaniesDialog, 'preload');
    const profile = vi.spyOn(SearchProfileDialog, 'preload');
    renderApp();
    expect(companies).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Account' }));
    await screen.findByRole('menuitem', { name: 'Companies' });
    expect(companies).toHaveBeenCalled();
    expect(profile).toHaveBeenCalled();
    companies.mockRestore();
    profile.mockRestore();
  });

  it('lists Followed and Ignored; Ignore and Follow again move a company between them', async () => {
    const user = userEvent.setup();
    saveProfile({ titles: ['Design Systems Designer'], mode: 'remote' });
    addSources([{ kind: 'ashby', ref: 'ramp', label: 'Ramp' }]);
    followCompany('Linear');
    muteCompany('Forward');
    renderApp();
    await user.click(screen.getByRole('button', { name: 'Account' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Companies' }));
    const dialog = await screen.findByRole('dialog', { name: 'Companies' });
    const followed = within(dialog).getByRole('list', { name: 'Followed' });
    expect(
      within(followed)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([expect.stringMatching(/^Linear/), expect.stringMatching(/^Ramp/i)]);
    // One list at a time: Ignored is one tap away, its count on the control.
    expect(within(dialog).getByRole('list', { name: 'Followed' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('radio', { name: 'Ignored (1)' }));
    expect(
      within(within(dialog).getByRole('list', { name: 'Ignored' })).getByText('Forward'),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole('radio', { name: 'Followed (2)' }));

    await user.click(within(dialog).getByRole('button', { name: 'Ignore Linear' }));
    expect(getAllDecided().muted).toContain('Linear');
    await user.click(within(dialog).getByRole('radio', { name: 'Ignored (2)' }));
    expect(
      within(within(dialog).getByRole('list', { name: 'Ignored' })).getByText('Linear'),
    ).toBeInTheDocument();

    // Forward was muted from a posting (no board or follow): Follow again follows it by name.
    await user.click(within(dialog).getByRole('button', { name: 'Follow Forward again' }));
    expect(getAllDecided().muted).not.toContain('Forward');
    expect(getAllDecided().followed).toContain('Forward');
    expect(within(dialog).getByRole('radio', { name: 'Ignored (1)' })).toBeInTheDocument();
    expect(within(dialog).getByRole('radio', { name: 'Followed (2)' })).toBeInTheDocument();
  });

  it('a long Followed list draws a first batch on the press, then every row', async () => {
    const user = userEvent.setup();
    saveProfile({ titles: ['Design Systems Designer'], mode: 'remote' });
    const n = FIRST_ROWS * 3;
    addSources(
      Array.from({ length: n }, (_, i) => ({
        kind: 'ashby' as const,
        ref: `co${i}`,
        label: `Co ${String(i).padStart(3, '0')}`,
      })),
    );
    renderApp();
    await user.click(screen.getByRole('button', { name: 'Account' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Companies' }));
    const dialog = await screen.findByRole('dialog', { name: 'Companies' });
    const followed = within(dialog).getByRole('list', { name: 'Followed' });
    await waitFor(() => expect(within(followed).getAllByRole('listitem')).toHaveLength(n));
    expect(within(followed).getAllByRole('listitem')[n - 1].textContent).toMatch(
      new RegExp(`^Co ${String(n - 1).padStart(3, '0')}`),
    );
  });

  it('says so when there is nothing in either list', async () => {
    const user = userEvent.setup();
    saveProfile({ titles: ['Design Systems Designer'], mode: 'remote' });
    renderApp();
    await user.click(screen.getByRole('button', { name: 'Account' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Companies' }));
    const dialog = await screen.findByRole('dialog', { name: 'Companies' });
    expect(within(dialog).getByText(/No companies yet/)).toBeInTheDocument();
  });
});
