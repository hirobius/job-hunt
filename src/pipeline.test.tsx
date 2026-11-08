// Phase 3 of the redesign (#129): the Pipeline list. Tested at the route seam through App and
// driven by role + name. Every width gets the job cards (Adrian 2026-10-24: the 920 shell wrapped
// table titles to three lines): each job links to its page and has one primary action, with the
// rest in its menu.
import { itemsInLine, MAX_META_ITEMS } from './metaLines';
import { rowView } from './jobRow';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { openAllJobs, openListOnPhone } from './test/allJobs';
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
import { addJob, getAllJobs, jobIdOf, markAppliedByUrl, removeJob, updateJob } from './store';

const SAVED = 'https://acme.example/jobs/1';
const APPLIED = 'https://zenith.example/jobs/2';

const renderApp = () =>
  render(
    <ColorModeProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ColorModeProvider>,
  );

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

/** True when the element or anything inside it is faded (0 < opacity < 1), which drops text below
 *  AA. Opacity 0 is hidden, not faded (the job page's "Saved" flash). */
const faded = (el: HTMLElement) =>
  [el, ...el.querySelectorAll<HTMLElement>('*')].some(
    (e) => e.style.opacity !== '' && Number(e.style.opacity) > 0 && Number(e.style.opacity) < 1,
  );

const pastDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

beforeEach(() => {
  h.fake?.reset();
  localStorage.clear();
  window.history.replaceState(null, '', '/');
  window.location.hash = '#/apply';
  addJob(SAVED, 'Design Engineer');
  updateJob(SAVED, { company: 'Acme' });
  addJob(APPLIED, 'Zenith Product Designer');
  markAppliedByUrl(APPLIED, 'Zenith Product Designer');
  // Applied 10 days ago and pinned, so it stays in the default Active view with a follow-up due.
  updateJob(APPLIED, { applied: pastDays(10), priority: true, company: 'Zenith' });
});
afterEach(() => {
  cleanup();
  getAllJobs()
    .slice()
    .forEach((j) => removeJob(j.url));
  // @ts-expect-error -- jsdom has no matchMedia; tests that need one install it
  delete window.matchMedia;
});

describe('Pipeline on a phone (#129)', () => {
  beforeEach(() => viewport(390));

  it('shows compact cards: the title is a link to the job page on a row of its own', async () => {
    renderApp();
    await openListOnPhone();
    expect(screen.queryByRole('table')).toBeNull();
    const card = screen.getByRole('article', { name: 'Design Engineer' });
    const title = within(card).getByRole('link', { name: 'Design Engineer' });
    expect(title).toHaveAttribute('href', `#/apply/${jobIdOf(SAVED)}`);
    // Its heading holds the link alone.
    expect(title.closest('h3')!.textContent).toBe('Design Engineer');
  });

  it('reads the badges fit first, then status, then Follow-up due (#360)', async () => {
    updateJob(APPLIED, { verdict: 'match' });
    renderApp();
    await openListOnPhone();
    const card = screen.getByRole('article', { name: 'Zenith Product Designer' });
    const badges = [...card.querySelectorAll('[class*="--component-badge-height"]')].map((b) =>
      b.textContent?.trim(),
    );
    expect(badges).toEqual(['Strong fit', 'Applied', 'Follow-up due']);
  });

  it('opens the posting from its menu, no glyph by the title (Adrian 2026-10-22)', async () => {
    renderApp();
    await openListOnPhone();
    const card = screen.getByRole('article', { name: 'Design Engineer' });
    // No glyph beside the title (Adrian 2026-11-08): the posting is the card menu's Open posting.
    expect(
      within(card).queryByRole('link', { name: 'Open posting for Design Engineer at Acme' }),
    ).toBeNull();
    await userEvent.click(
      within(card).getByRole('button', { name: 'More actions: Design Engineer' }),
    );
    expect(
      within(await screen.findByRole('menu')).getByRole('menuitem', { name: 'Open posting' }),
    ).toHaveAttribute('href', SAVED);
  });

  it('each card has one primary action, the rest in its menu', async () => {
    renderApp();
    await openListOnPhone();
    const saved = screen.getByRole('article', { name: 'Design Engineer' });
    expect(
      within(saved).getByRole('button', { name: 'Mark applied: Design Engineer' }),
    ).toBeInTheDocument();
    const applied = screen.getByRole('article', { name: 'Zenith Product Designer' });
    expect(
      within(applied).getByRole('button', { name: 'Follow up: Zenith Product Designer' }),
    ).toBeInTheDocument();

    await userEvent.click(
      within(saved).getByRole('button', { name: 'More actions: Design Engineer' }),
    );
    const items = within(await screen.findByRole('menu'))
      .getAllByRole('menuitem')
      .map((i) => i.textContent?.trim());
    expect(items).toEqual(['Open posting', 'Add interview…', 'Star', 'Retire', 'Remove']);
    // One inset for every item: the stages are plain items marked by a trailing check, still
    // radio items for assistive tech (rev-3 mock).
    const stages = within(screen.getByRole('menu')).getAllByRole('menuitemradio');
    expect(
      stages.filter((i) => i.getAttribute('aria-checked') === 'true').map((i) => i.textContent),
    ).toEqual(['Saved']);
  });

  it('Mark applied moves the job out of the Active view', async () => {
    renderApp();
    await openListOnPhone();
    await userEvent.click(screen.getByRole('button', { name: 'Mark applied: Design Engineer' }));
    expect(getAllJobs().find((j) => j.url === SAVED)?.status).toBe('Applied');
    expect(screen.queryByRole('article', { name: 'Design Engineer' })).toBeNull();
  });

  it('Follow up opens the follow-up message; closing it leaves the job alone', async () => {
    const user = userEvent.setup();
    renderApp();
    await openListOnPhone();
    const before = getAllJobs().find((j) => j.url === APPLIED);
    // The card's own Follow up (the Follow up section above the list has one too, #236).
    const card = screen.getByRole('article', { name: 'Zenith Product Designer' });
    await user.click(
      within(card).getByRole('button', { name: 'Follow up: Zenith Product Designer' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Follow up' });
    expect(within(dialog).getByRole('button', { name: 'Copy message' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Follow up' })).toBeNull());
    expect(getAllJobs().find((j) => j.url === APPLIED)).toEqual(before);
  });
});

describe('focus stays in the list when a row leaves it (audit 2026-10-27)', () => {
  beforeEach(() => viewport(390));
  const THIRD = 'https://orbit.example/jobs/3';
  beforeEach(() => {
    addJob(THIRD, 'Orbit Researcher');
  });

  it('Mark applied by keyboard moves focus to the next card, not the page top', async () => {
    const user = userEvent.setup();
    renderApp();
    await openListOnPhone();
    const all = screen.getAllByRole('article');
    // The first Saved card (the starred Applied job sorts first).
    const i = all.findIndex((a) => within(a).queryByRole('button', { name: /^Mark applied:/ }));
    const firstName = within(all[i]).getByRole('heading').textContent!;
    const nextName = within(all[i + 1]).getByRole('heading').textContent!;
    within(all[i])
      .getByRole('button', { name: /^Mark applied:/ })
      .focus();
    await user.keyboard('{Enter}');
    expect(screen.queryByRole('article', { name: firstName })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('link', { name: nextName }));
  });

  it('Mark applied on a starred job (it stays Active) keeps focus on its own card', async () => {
    const user = userEvent.setup();
    updateJob(SAVED, { priority: true });
    renderApp();
    await openListOnPhone();
    const card = screen.getByRole('article', { name: 'Design Engineer' });
    within(card).getByRole('button', { name: 'Mark applied: Design Engineer' }).focus();
    await user.keyboard('{Enter}');
    const after = screen.getByRole('article', { name: 'Design Engineer' });
    expect(document.activeElement).toBe(
      within(after).getByRole('link', { name: 'Design Engineer' }),
    );
  });

  it('Remove from the last card moves focus to the card before it', async () => {
    const user = userEvent.setup();
    renderApp();
    await openListOnPhone();
    const all = screen.getAllByRole('article');
    const last = all[all.length - 1];
    const lastName = within(last).getByRole('heading').textContent!;
    const prevName = within(all[all.length - 2]).getByRole('heading').textContent!;
    await user.click(within(last).getByRole('button', { name: /^More actions:/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Remove' }));
    await waitFor(() => expect(screen.queryByRole('article', { name: lastName })).toBeNull());
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('link', { name: prevName })),
    );
  });

  it('Clear filters gives focus to the search, and the shown count is announced', async () => {
    const user = userEvent.setup();
    renderApp();
    await openListOnPhone();
    const search = screen.getByRole('textbox', { name: 'Search saved jobs' });
    await user.type(search, 'zzz');
    await waitFor(() =>
      expect(screen.getAllByRole('status').some((s) => s.textContent === '0 jobs shown')).toBe(
        true,
      ),
    );
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(document.activeElement).toBe(search);
    await waitFor(() =>
      expect(screen.getAllByRole('status').some((s) => s.textContent === '3 jobs shown')).toBe(
        true,
      ),
    );
  });

  it('Clear search in the empty list gives focus to the search', async () => {
    const user = userEvent.setup();
    renderApp();
    await openListOnPhone();
    const search = screen.getByRole('textbox', { name: 'Search saved jobs' });
    await user.type(search, 'zzz');
    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(document.activeElement).toBe(search);
  });
});

describe('Retired jobs stay readable', () => {
  beforeEach(() => updateJob(SAVED, { archived: true, verdict: 'match' }));
  const showRetired = async () => {
    await userEvent.click(screen.getByRole('button', { name: /^Status:/ }));
    await userEvent.click(
      within(await screen.findByRole('menu')).getByRole('menuitemradio', { name: /^Retired/ }),
    );
  };

  it('a retired card says so in words, without fading its text', async () => {
    viewport(390);
    renderApp();
    await openListOnPhone();
    await showRetired();
    const card = screen.getByRole('article', { name: 'Design Engineer' });
    expect(within(card).getByText('Retired')).toBeInTheDocument();
    expect(within(card).getByText('Acme')).toBeInTheDocument();
    expect(faded(card)).toBe(false);
  });

  // From lg the list is the column beside a job (#471); cards show up to there.
  it('a retired card on a tablet says so in words too, without fading its text', async () => {
    viewport(800);
    renderApp();
    await openListOnPhone();
    await showRetired();
    expect(screen.queryByRole('table')).toBeNull();
    const card = screen.getByRole('article', { name: 'Design Engineer' });
    expect(within(card).getByText('Retired')).toBeInTheDocument();
    expect(within(card).getByText('Acme')).toBeInTheDocument();
    expect(faded(card)).toBe(false);
  });
});

describe('Pipeline filter (#129)', () => {
  beforeEach(() => viewport(390));

  it('a non-default status shows a quiet Clear that goes back to Active (rev-3 item 1)', async () => {
    renderApp();
    await openListOnPhone();
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /^Status:/ }));
    await userEvent.click(
      within(await screen.findByRole('menu')).getByRole('menuitemradio', { name: /^Applied/ }),
    );
    expect(screen.getByRole('button', { name: 'Status: Applied' })).toHaveTextContent('Applied');
    await userEvent.click(await screen.findByRole('button', { name: 'Clear filters' }));
    expect(screen.getByRole('button', { name: /^Status: Active/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();
  });

  it('Clear sits in the Jobs panel header, so Status and Sort keep the whole row (rev-3 polish)', async () => {
    renderApp();
    await openListOnPhone();
    await userEvent.type(screen.getByRole('textbox', { name: 'Search saved jobs' }), 'zzz');
    const clear = await screen.findByRole('button', { name: 'Clear filters' });
    const search = screen.getByRole('textbox', { name: 'Search saved jobs' });
    // Above the search: in the header row beside "Jobs N", not in the select row.
    expect(clear.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(clear).toHaveTextContent(/^Clear$/);
  });

  it('All is demoted to the end of the status menu', async () => {
    renderApp();
    await openListOnPhone();
    await userEvent.click(screen.getByRole('button', { name: /^Status:/ }));
    const names = within(await screen.findByRole('menu'))
      .getAllByRole('menuitemradio')
      .map((i) => i.textContent?.replace(/\d+$/, '').trim());
    expect(names).toEqual([
      'Active',
      'Starred',
      'Saved',
      'Applied',
      'Interviewing',
      'Offer',
      'Closing soon',
      'Closed',
      'Rejected',
      'Retired',
      'All',
    ]);
  });
});

// From lg the list is the column beside a job (#471, jobPage.test.tsx); the card list holds below it.
describe('Pipeline on a tablet: cards too (Adrian 2026-10-24)', () => {
  beforeEach(() => viewport(800));

  it('is the card list, not a table: status, follow-up and one action per card', async () => {
    renderApp();
    await openListOnPhone();
    expect(screen.queryByRole('table')).toBeNull();
    const card = screen.getByRole('article', { name: 'Zenith Product Designer' });
    expect(within(card).getByRole('link', { name: 'Zenith Product Designer' })).toHaveAttribute(
      'href',
      `#/apply/${jobIdOf(APPLIED)}`,
    );
    expect(within(card).getByText('Applied')).toBeInTheDocument();
    expect(within(card).getByText('Follow-up due')).toBeInTheDocument();
    expect(
      within(card).getByRole('button', { name: 'Follow up: Zenith Product Designer' }),
    ).toBeInTheDocument();
  });

  it('each card opens its posting from its menu, no glyph by the title (Adrian 2026-10-22)', async () => {
    renderApp();
    await openListOnPhone();
    const card = screen.getByRole('article', { name: 'Design Engineer' });
    // No glyph beside the title (Adrian 2026-11-08): the posting is the card menu's Open posting.
    expect(
      within(card).queryByRole('link', { name: 'Open posting for Design Engineer at Acme' }),
    ).toBeNull();
    await userEvent.click(
      within(card).getByRole('button', { name: 'More actions: Design Engineer' }),
    );
    expect(
      within(await screen.findByRole('menu')).getByRole('menuitem', { name: 'Open posting' }),
    ).toHaveAttribute('href', SAVED);
  });

  it('marks starred cards (they float in every sort) and retired ones', async () => {
    updateJob(SAVED, { archived: true });
    renderApp();
    await openListOnPhone();
    const starredCard = screen.getByRole('article', { name: 'Zenith Product Designer' });
    expect(within(starredCard).getByText('Starred')).toBeInTheDocument();
    // Retired jobs show under the Retired view, with their real status and a Retired note.
    await userEvent.click(screen.getByRole('button', { name: /^Status:/ }));
    await userEvent.click(
      within(await screen.findByRole('menu')).getByRole('menuitemradio', { name: /^Retired/ }),
    );
    const card = screen.getByRole('article', { name: 'Design Engineer' });
    expect(within(card).getByText('Saved')).toBeInTheDocument();
    expect(within(card).getByText('Retired')).toBeInTheDocument();
    expect(within(card).queryByText('Starred')).toBeNull();
  });

  it('sorts through the toolbar Sort menu, and back', async () => {
    addJob('https://acme.example/jobs/3', 'Writer'); // the newest, but last A–Z
    renderApp();
    await openListOnPhone();
    const titles = () =>
      screen.getAllByRole('article').map((a) => within(a).getByRole('heading').textContent);
    const pickSort = async (name: string) => {
      await userEvent.click(screen.getByRole('button', { name: /^Sort:/ }));
      await userEvent.click(
        within(await screen.findByRole('menu')).getByRole('menuitemradio', { name }),
      );
    };
    // Default: the pinned job with a due follow-up first, then most recently added.
    expect(titles()).toEqual(['Zenith Product Designer', 'Writer', 'Design Engineer']);
    await pickSort('A–Z');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Sort: A–Z' })).toBeInTheDocument(),
    );
    // Priority still floats in every sort (jobSort's invariant); A–Z orders the rest.
    expect(titles()).toEqual(['Zenith Product Designer', 'Design Engineer', 'Writer']);
    await pickSort('Recently added');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Sort: Newest' })).toBeInTheDocument(),
    );
    expect(titles()).toEqual(['Zenith Product Designer', 'Writer', 'Design Engineer']);
  });
});

describe('shared list state (#130 slice 4)', () => {
  it('the filter, search and sort survive a jump to a job and opening the list again', async () => {
    renderApp();
    await openListOnPhone();
    await userEvent.type(screen.getByRole('textbox', { name: 'Search saved jobs' }), 'Zenith');
    // The title also links from the Follow up list; either opens the same job.
    // A jump from the sheet opens the job in place and closes it (Proposal A).
    const sheet = screen.getByRole('dialog', { name: 'All jobs' });
    await userEvent.click(
      within(within(sheet).getByRole('article', { name: 'Zenith Product Designer' })).getByRole(
        'link',
        { name: 'Zenith Product Designer' },
      ),
    );
    await waitFor(() => expect(window.location.hash).toBe(`#/apply/${jobIdOf(APPLIED)}`));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'All jobs' })).toBeNull());
    await openAllJobs();
    expect(screen.getByRole('textbox', { name: 'Search saved jobs' })).toHaveValue('Zenith');
    expect(screen.queryByRole('link', { name: 'Design Engineer' })).toBeNull();
  });
});

describe('Pipeline rows keep to two items per dotted line (#192)', () => {
  it('a job with company and location and a retired mark wraps its facts to two per line', async () => {
    viewport(0); // cards
    updateJob(SAVED, { company: 'Acme Cloud', location: 'Remote', archived: true });
    expect(rowView(getAllJobs().find((j) => j.url === SAVED)!).factLines).toEqual([
      'Retired · Acme Cloud',
      'Remote',
    ]);
    window.location.hash = '#/apply';
    renderApp();
    await openListOnPhone();
    const texts = [...document.body.querySelectorAll('*')]
      .filter((e) => e.children.length === 0)
      .map((e) => e.textContent ?? '');
    expect(texts.filter((t) => itemsInLine(t) > MAX_META_ITEMS)).toEqual([]);
  });
});

describe('Active empty action and Star Undo (#361)', () => {
  beforeEach(() => viewport(390));
  // In the All jobs sheet (a modal) the notice is its footer's (DialogNotice), the last status.
  const notice = () => {
    const sheet = screen.queryByRole('dialog', { name: 'All jobs' });
    return sheet
      ? within(sheet).getAllByRole('status').slice(-1)[0]
      : screen.getByRole('region', { name: /^Notifications/ });
  };

  it('the Active empty offers Show applied: it sets the filter to Applied and keeps focus in the panel', async () => {
    const user = userEvent.setup();
    // Nothing is Active: both jobs are Applied and neither is starred.
    markAppliedByUrl(SAVED, 'Design Engineer');
    updateJob(APPLIED, { priority: false });
    renderApp();
    await openListOnPhone();
    expect(screen.getByText('Nothing left to apply to')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show applied' }));
    const status = screen.getByRole('button', { name: /^Status: Applied/ });
    expect(status).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Design Engineer' })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Zenith Product Designer' })).toBeInTheDocument();
    // The empty state unmounted, but focus stayed in the panel — on the Status select.
    expect(document.activeElement).toBe(status);
  });

  it('Unstar from a card menu under Starred raises the shared notice, and Undo brings the card back', async () => {
    const user = userEvent.setup();
    renderApp();
    await openListOnPhone();
    await user.click(screen.getByRole('button', { name: /^Status:/ }));
    await user.click(
      within(await screen.findByRole('menu')).getByRole('menuitemradio', { name: /^Starred/ }),
    );
    const card = screen.getByRole('article', { name: 'Zenith Product Designer' });
    await user.click(
      within(card).getByRole('button', { name: 'More actions: Zenith Product Designer' }),
    );
    await user.click(
      within(await screen.findByRole('menu')).getByRole('menuitem', { name: 'Unstar' }),
    );
    expect(getAllJobs().find((j) => j.url === APPLIED)?.priority).toBeFalsy();
    expect(screen.queryByRole('article', { name: 'Zenith Product Designer' })).toBeNull();
    expect(within(notice()).getByText('Unstarred')).toBeInTheDocument();
    await user.click(within(notice()).getByRole('button', { name: 'Undo' }));
    expect(getAllJobs().find((j) => j.url === APPLIED)?.priority).toBe(true);
    expect(screen.getByRole('article', { name: 'Zenith Product Designer' })).toBeInTheDocument();
  });

  it('Star from a card menu raises the shared notice with Undo, and the card flashes and stays', async () => {
    const user = userEvent.setup();
    renderApp();
    await openListOnPhone();
    const card = screen.getByRole('article', { name: 'Design Engineer' });
    await user.click(within(card).getByRole('button', { name: 'More actions: Design Engineer' }));
    await user.click(
      within(await screen.findByRole('menu')).getByRole('menuitem', { name: 'Star' }),
    );
    expect(getAllJobs().find((j) => j.url === SAVED)?.priority).toBe(true);
    expect(screen.getByRole('article', { name: 'Design Engineer' })).toBeInTheDocument();
    expect(card.getAttribute('data-motion')).toBe('flash');
    expect(within(notice()).getByText('Starred')).toBeInTheDocument();
    await user.click(within(notice()).getByRole('button', { name: 'Undo' }));
    expect(getAllJobs().find((j) => j.url === SAVED)?.priority).toBeFalsy();
  });
});
