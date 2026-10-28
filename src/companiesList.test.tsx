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
import { addCategory, replaceCurationState } from './curation/curationStore';
import { EMPTY_CURATION } from './curation/types';
import { watchBoard } from './feed/watchlist';
import { followCompany, getAllDecided, muteCompany } from './feed/decided';
import { companiesLists } from './companiesList';
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
    expect(companiesLists([], ['forward']).ignored).toEqual([{ key: 'forward', label: 'forward' }]);
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
  replaceCurationState(EMPTY_CURATION);
  window.history.replaceState(null, '', '/');
  window.location.hash = '#/today';
});
afterEach(() => {
  cleanup();
  replaceCurationState(EMPTY_CURATION);
});

describe('Account menu → Companies', () => {
  it('lists Followed and Ignored; Ignore and Follow again move a company between them', async () => {
    const user = userEvent.setup();
    const track = addCategory({ label: 'Design systems', titles: ['Design Systems Designer'] });
    watchBoard(track, 'https://jobs.ashbyhq.com/ramp');
    followCompany('Linear');
    muteCompany('Forward');
    renderApp();
    await user.click(screen.getByRole('button', { name: 'Account' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Companies' }));
    const dialog = await screen.findByRole('dialog', { name: 'Companies' });
    const followed = within(dialog).getByRole('list', { name: 'Followed' });
    const ignored = within(dialog).getByRole('list', { name: 'Ignored' });
    expect(
      within(followed)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([expect.stringMatching(/^Linear/), expect.stringMatching(/^Ramp/i)]);
    expect(within(ignored).getByText('Forward')).toBeInTheDocument();

    await user.click(within(followed).getByRole('button', { name: 'Ignore Linear' }));
    expect(getAllDecided().muted).toContain('Linear');
    await waitFor(() =>
      expect(
        within(within(dialog).getByRole('list', { name: 'Ignored' })).getByText('Linear'),
      ).toBeInTheDocument(),
    );

    await user.click(within(dialog).getByRole('button', { name: 'Follow Forward again' }));
    expect(getAllDecided().muted).not.toContain('Forward');
  });

  it('says so when there is nothing in either list', async () => {
    const user = userEvent.setup();
    addCategory({ label: 'Design systems', titles: ['Design Systems Designer'] });
    renderApp();
    await user.click(screen.getByRole('button', { name: 'Account' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Companies' }));
    const dialog = await screen.findByRole('dialog', { name: 'Companies' });
    expect(within(dialog).getByText(/No companies yet/)).toBeInTheDocument();
  });
});
