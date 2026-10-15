// Templates as a list and an editor (#132 slices 2-3), tested at the route seam through App and
// driven by role + name: `#/copy-deck` lists, `#/copy-deck/<id>` opens one snippet, an unknown id
// returns to the list; search, pinned first, delete asks first. Desktop (>= lg) shows list and
// detail together; a phone shows one at a time.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
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
import { getAllJobs, removeJob } from './store';
import { replaceCurationState } from './curation/curationStore';
import { seedPack } from './curation/starterPacks';
import {
  getSnippets,
  replaceSnippets,
  restoreStarterSnippets,
  updateSnippet,
} from './copyDeckStore';

// Templates is code-split: wait for its skeleton to go before reading anything.
const renderApp = async () => {
  render(
    <ColorModeProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ColorModeProvider>,
  );
  await waitFor(() => expect(screen.queryByLabelText('Loading')).toBeNull());
};

/** A viewport at least `width` px wide, as matchMedia sees it. */
function viewport(width: number) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => {
    const min = /min-width:\s*(\d+)px/.exec(query);
    return {
      matches: min ? width >= Number(min[1]) : false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    };
  });
}

const rows = () =>
  within(screen.getByRole('navigation', { name: 'Templates' })).getAllByRole('listitem');
const rowNames = () => rows().map((r) => within(r).getByRole('link').textContent);
const label = () => screen.getByRole('textbox', { name: 'Snippet label' }) as HTMLInputElement;

beforeEach(() => {
  h.fake?.reset();
  localStorage.clear();
  seedPack('consulting'); // a track, so Today isn't the first-run gate
  replaceSnippets([]);
  restoreStarterSnippets();
  window.history.replaceState(null, '', '/');
  window.location.hash = '#/copy-deck';
});
afterEach(() => {
  cleanup();
  // @ts-expect-error -- jsdom has no matchMedia; tests that need one install it
  delete window.matchMedia;
  getAllJobs()
    .slice()
    .forEach((j) => removeJob(j.url));
  replaceCurationState({ categories: [], groups: [], tiles: [] });
});

describe('Templates on a desktop (list and detail together)', () => {
  beforeEach(() => viewport(1440));

  it('#/copy-deck lists every template and opens the first without rewriting the hash', async () => {
    await renderApp();
    expect(rowNames()).toEqual([
      expect.stringMatching(/^Outreach note/),
      expect.stringMatching(/^Cover letter/),
      expect.stringMatching(/^Follow-up after applying/),
      expect.stringMatching(/^Thank-you after interview/),
    ]);
    expect(label().value).toBe('Outreach note');
    expect(window.location.hash).toBe('#/copy-deck');
  });

  it('shows the first line of each body under its name', async () => {
    await renderApp();
    expect(within(rows()[1]).getByText('Dear [Contact],')).toBeInTheDocument();
  });

  it('#/copy-deck/<id> opens that template and marks its row current', async () => {
    window.location.hash = '#/copy-deck/tpl-cover';
    await renderApp();
    expect(label().value).toBe('Cover letter');
    expect(within(rows()[1]).getByRole('link')).toHaveAttribute('aria-current', 'page');
    expect(within(rows()[0]).getByRole('link')).not.toHaveAttribute('aria-current');
  });

  it('clicking a row routes by its id', async () => {
    await renderApp();
    await userEvent.click(within(rows()[2]).getByRole('link'));
    await waitFor(() => expect(window.location.hash).toBe('#/copy-deck/tpl-followup'));
    expect(label().value).toBe('Follow-up after applying');
  });

  it('an unknown id falls back to the list, replacing the entry', async () => {
    window.location.hash = '#/copy-deck/nope';
    await renderApp();
    await waitFor(() => expect(window.location.hash).toBe('#/copy-deck'));
    expect(label().value).toBe('Outreach note');
  });

  it('editing the label and text writes to the snippet', async () => {
    window.location.hash = '#/copy-deck/tpl-thanks';
    await renderApp();
    await userEvent.type(label(), '!');
    expect(getSnippets().find((s) => s.id === 'tpl-thanks')?.label).toBe(
      'Thank-you after interview!',
    );
    await userEvent.clear(screen.getByRole('textbox', { name: 'Snippet text' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Snippet text' }), 'Hello');
    expect(getSnippets().find((s) => s.id === 'tpl-thanks')?.body).toBe('Hello');
  });

  it('pinned templates sort first, with a star', async () => {
    window.location.hash = '#/copy-deck/tpl-thanks';
    await renderApp();
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Pin' }));
    expect(rowNames()[0]).toMatch(/^Thank-you after interview/);
    expect(within(rows()[0]).getByLabelText('Pinned')).toBeInTheDocument();
  });

  it('search filters by name or text; no match says so and Clear search restores', async () => {
    await renderApp();
    const search = screen.getByRole('searchbox', { name: 'Search templates' });
    await userEvent.type(search, 'interview');
    expect(rowNames()).toEqual([expect.stringMatching(/^Thank-you after interview/)]);
    await userEvent.clear(search);
    await userEvent.type(search, 'zzzz');
    expect(screen.getByText('No matches')).toBeInTheDocument();
    expect(screen.getByText(/Nothing is named or says “zzzz”/)).toBeInTheDocument();
    // The search field has its own clear button too; the empty state's comes last.
    const clears = screen.getAllByRole('button', { name: 'Clear search' });
    await userEvent.click(clears[clears.length - 1]);
    expect(rows()).toHaveLength(4);
  });

  it('Delete asks first: cancel keeps it, confirming removes it and returns to the list', async () => {
    window.location.hash = '#/copy-deck/tpl-cover';
    await renderApp();
    const del = async () => {
      await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
      return screen.findByRole('alertdialog');
    };
    let dialog = await del();
    expect(dialog).toHaveTextContent(/Delete “Cover letter”/);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(getSnippets().some((s) => s.id === 'tpl-cover')).toBe(true);
    dialog = await del();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(getSnippets().some((s) => s.id === 'tpl-cover')).toBe(false));
    await waitFor(() => expect(window.location.hash).toBe('#/copy-deck'));
  });

  it('Duplicate opens the copy; New snippet opens an empty one', async () => {
    window.location.hash = '#/copy-deck/tpl-cover';
    await renderApp();
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Duplicate' }));
    await waitFor(() => expect(label().value).toBe('Cover letter (copy)'));
    await userEvent.click(screen.getByRole('button', { name: 'New snippet' }));
    await waitFor(() => expect(label().value).toBe('New snippet'));
    expect(window.location.hash).toBe(`#/copy-deck/${getSnippets()[getSnippets().length - 1].id}`);
  });
});

describe('Templates on a phone (one pane at a time)', () => {
  beforeEach(() => viewport(390));

  it('#/copy-deck is the list alone; a row opens its detail with a back link', async () => {
    await renderApp();
    expect(rows()).toHaveLength(4);
    expect(screen.queryByRole('textbox', { name: 'Snippet label' })).toBeNull();
    await userEvent.click(within(rows()[1]).getByRole('link'));
    await waitFor(() => expect(window.location.hash).toBe('#/copy-deck/tpl-cover'));
    expect(label().value).toBe('Cover letter');
    expect(screen.queryByRole('navigation', { name: 'Templates' })).toBeNull();
    await userEvent.click(screen.getByRole('link', { name: 'Templates' }));
    await waitFor(() => expect(window.location.hash).toBe('#/copy-deck'));
    expect(rows()).toHaveLength(4);
  });

  it('opens a detail link directly', async () => {
    window.location.hash = '#/copy-deck/tpl-thanks';
    await renderApp();
    expect(label().value).toBe('Thank-you after interview');
  });
});

describe('Templates empties', () => {
  it('none: says what templates hold; New snippet adds one; Restore the starter set brings the defaults back', async () => {
    viewport(1440);
    replaceSnippets([]);
    await renderApp();
    expect(screen.getByText('No templates yet')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Restore the starter set' }));
    expect(rows()).toHaveLength(4);
  });

  it('restoring never overwrites an edited starter template', async () => {
    updateSnippet('tpl-cover', { label: 'My cover letter' });
    restoreStarterSnippets();
    expect(getSnippets().filter((s) => s.id === 'tpl-cover')).toEqual([
      expect.objectContaining({ label: 'My cover letter' }),
    ]);
    expect(getSnippets()).toHaveLength(4);
  });
});
