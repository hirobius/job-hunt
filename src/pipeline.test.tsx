// Phase 3 of the redesign (#129): the Pipeline list. Tested at the route seam through App and
// driven by role + name. Below lg the list is the All jobs sheet (#543): rows on one surface, each
// a link to its job (named by its title), with no key, menu or posting glyph of its own; a job's
// next step and its menu live on the job page.
import { itemsInLine, MAX_META_ITEMS } from './metaLines';
import { rowView } from './jobRow';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
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
import { JobsList } from './TrackerView';
import { getPipelineView, setPipelineView } from './pipelineView';
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

/** The All jobs sheet's list (below lg). */
const jobsNav = () =>
  within(screen.getByRole('dialog', { name: 'All jobs' })).getByRole('navigation', {
    name: 'Jobs',
  });
/** A job's row in the list: the `li` around its link. */
const queryRow = (name: string) =>
  (within(jobsNav()).queryByRole('link', { name })?.closest('li') as HTMLElement | null) ?? null;
const row = (name: string) => {
  const r = queryRow(name);
  if (!r) throw new Error(`no row for ${name}`);
  return r;
};
/** The rows' titles, top to bottom. */
const titles = () =>
  within(jobsNav())
    .getAllByRole('listitem')
    .map((li) => li.querySelector('.rjb-clamp-2')?.textContent);
/** A job's own page (the row menu's actions live in its header since #543). */
const openJobPage = (url: string) => {
  window.location.hash = `#/apply/${jobIdOf(url)}`;
  return renderApp();
};

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
  // Applied 10 days ago (pinned in the old data), so its follow-up is due: it shows under Follow up
  // and All jobs, not To apply (#541).
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

  it('shows compact rows: each is a link to the job page, named by its title', async () => {
    renderApp();
    await openListOnPhone();
    expect(screen.queryByRole('table')).toBeNull();
    const title = within(jobsNav()).getByRole('link', { name: 'Design Engineer' });
    expect(title).toHaveAttribute('href', `#/apply/${jobIdOf(SAVED)}`);
    // The title is its own line, two lines at most (#543).
    expect(row('Design Engineer').querySelector('.rjb-clamp-2')!.textContent).toBe(
      'Design Engineer',
    );
  });

  it('reads the badges status, then Follow-up due; no fit chip (#360, #538)', async () => {
    updateJob(APPLIED, { verdict: 'match' });
    setPipelineView({ filter: 'all' });
    renderApp();
    await openListOnPhone();
    const card = row('Zenith Product Designer');
    const badges = [...card.querySelectorAll('[class*="--component-badge-height"]')].map((b) =>
      b.textContent?.trim(),
    );
    expect(badges).toEqual(['Applied', 'Follow-up due']);
  });

  it('a row has no posting glyph; the job page menu opens the posting (#543)', async () => {
    renderApp();
    await openListOnPhone();
    const card = row('Design Engineer');
    expect(
      within(card).queryByRole('link', { name: 'Open posting for Design Engineer at Acme' }),
    ).toBeNull();
    expect(within(card).getAllByRole('link')).toHaveLength(1);
    cleanup();
    openJobPage(SAVED);
    await userEvent.click(
      await screen.findByRole('button', { name: 'More actions: Design Engineer' }),
    );
    expect(
      within(await screen.findByRole('menu')).getByRole('menuitem', { name: 'Open posting' }),
    ).toHaveAttribute('href', SAVED);
  });

  it('a row has no key or menu of its own; the job page holds its one next step and menu (#543)', async () => {
    setPipelineView({ filter: 'all' });
    renderApp();
    await openListOnPhone();
    for (const name of ['Design Engineer', 'Zenith Product Designer'])
      expect(within(row(name)).queryAllByRole('button')).toEqual([]);
    cleanup();
    openJobPage(SAVED);
    expect(
      await screen.findByRole('button', { name: 'More actions: Design Engineer' }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'More actions: Design Engineer' }));
    const items = within(await screen.findByRole('menu'))
      .getAllByRole('menuitem')
      .map((i) => i.textContent?.trim());
    // No Star (#534); Remove says what it takes the job off. The header's menu adds the company's
    // research links.
    expect(items).toEqual([
      'Open posting',
      'Add interview…',
      'Retire',
      'Glassdoor',
      'LinkedIn',
      'levels.fyi',
      'Google',
      'Remove from Apply',
    ]);
    // One inset for every item: the stages are plain items marked by a trailing check, still
    // radio items for assistive tech (rev-3 mock).
    const stages = within(screen.getByRole('menu')).getAllByRole('menuitemradio');
    expect(
      stages.filter((i) => i.getAttribute('aria-checked') === 'true').map((i) => i.textContent),
    ).toEqual(['Saved']);
  });

  it('Mark applied moves the job out of the To apply view', async () => {
    renderApp();
    // The tab opens on the first job to apply to; its dock marks it applied.
    await userEvent.click(
      await screen.findByRole('button', { name: 'Mark applied: Design Engineer' }),
    );
    await waitFor(() => expect(getAllJobs().find((j) => j.url === SAVED)?.status).toBe('Applied'));
    // The list (the All jobs sheet's body) no longer shows it under To apply. Rendered on its own:
    // after the last Mark applied the walk's picker does not open in jsdom (also on main).
    cleanup();
    render(
      <ToastProvider>
        <JobsList />
      </ToastProvider>,
    );
    expect(screen.getByRole('button', { name: /^To apply \d/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.queryByRole('link', { name: 'Design Engineer' })).toBeNull();
    expect(screen.getByText('Nothing left to apply to')).toBeInTheDocument();
  });

  it('Follow up opens the follow-up message; closing it leaves the job alone', async () => {
    const user = userEvent.setup();
    openJobPage(APPLIED);
    const before = getAllJobs().find((j) => j.url === APPLIED);
    // The job page's menu keeps "Follow up…" for the dialog (the dock copies it, #540).
    await user.click(
      await screen.findByRole('button', { name: 'More actions: Zenith Product Designer' }),
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Follow up…' }));
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
  const links = () => within(jobsNav()).getAllByRole('link');

  it('a focused row that leaves the view (applied elsewhere) hands focus to the next row', async () => {
    renderApp();
    await openListOnPhone();
    const all = links();
    expect(all.length).toBeGreaterThan(1);
    const leaving = all[0];
    const nextName = all[1].textContent;
    const leavingUrl = getAllJobs().find(
      (j) => `#/apply/${jobIdOf(j.url)}` === leaving.getAttribute('href'),
    )!.url;
    leaving.focus();
    act(() => markAppliedByUrl(leavingUrl));
    await waitFor(() => expect(links()).toHaveLength(all.length - 1));
    await waitFor(() => expect(document.activeElement?.textContent).toBe(nextName));
    expect(jobsNav().contains(document.activeElement)).toBe(true);
  });

  it('in All jobs (the job stays shown) focus stays on its own row', async () => {
    setPipelineView({ filter: 'all' });
    renderApp();
    await openListOnPhone();
    within(jobsNav()).getByRole('link', { name: 'Design Engineer' }).focus();
    act(() => markAppliedByUrl(SAVED));
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(jobsNav()).getByRole('link', { name: 'Design Engineer' }),
      ),
    );
  });

  it('the last row removed moves focus to the row before it', async () => {
    renderApp();
    await openListOnPhone();
    const all = links();
    const last = all[all.length - 1];
    const prevName = all[all.length - 2].textContent;
    const lastUrl = getAllJobs().find(
      (j) => `#/apply/${jobIdOf(j.url)}` === last.getAttribute('href'),
    )!.url;
    last.focus();
    act(() => removeJob(lastUrl));
    await waitFor(() => expect(links()).toHaveLength(all.length - 1));
    await waitFor(() => expect(document.activeElement?.textContent).toBe(prevName));
  });

  it('Clear N gives focus to the search, and the shown count is announced', async () => {
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
    await user.click(screen.getByRole('button', { name: 'Clear 1 filter' }));
    expect(document.activeElement).toBe(search);
    await waitFor(() =>
      expect(screen.getAllByRole('status').some((s) => s.textContent === '2 jobs shown')).toBe(
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
    // Set-aside jobs show under All jobs (#541: no Retired view since the Status select went).
    await userEvent.click(screen.getByRole('button', { name: /^All jobs \d/ }));
  };

  it('a retired row says so in words, without fading its text', async () => {
    viewport(390);
    renderApp();
    await openListOnPhone();
    await showRetired();
    const card = row('Design Engineer');
    expect(within(card).getAllByText(/Retired/).length).toBeGreaterThan(0);
    expect(within(card).getByText(/Acme/)).toBeInTheDocument();
    expect(faded(card)).toBe(false);
  });

  // From lg the list is the column beside a job (#471); the sheet's rows show up to there.
  it('a retired row on a tablet says so in words too, without fading its text', async () => {
    viewport(800);
    renderApp();
    await openListOnPhone();
    await showRetired();
    expect(screen.queryByRole('table')).toBeNull();
    const card = row('Design Engineer');
    expect(within(card).getAllByText(/Retired/).length).toBeGreaterThan(0);
    expect(within(card).getByText(/Acme/)).toBeInTheDocument();
    expect(faded(card)).toBe(false);
  });
});

describe('Pipeline filter (#129, #543)', () => {
  beforeEach(() => viewport(390));

  it('a view is not a filter: no Clear; Remote only is, and "Clear 1" takes it off (#543)', async () => {
    renderApp();
    await openListOnPhone();
    expect(screen.queryByRole('button', { name: /^Clear \d/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /^Applied \d/ }));
    expect(screen.getByRole('button', { name: /^Applied \d/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.queryByRole('button', { name: /^Clear \d/ })).toBeNull();
    const remote = within(screen.getByRole('group', { name: 'Filters' })).getByRole('button', {
      name: 'Remote only',
    });
    await userEvent.click(remote);
    expect(remote).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(await screen.findByRole('button', { name: 'Clear 1 filter' }));
    expect(remote).toHaveAttribute('aria-pressed', 'false');
    // The view stays what was picked.
    expect(screen.getByRole('button', { name: /^Applied \d/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.queryByRole('button', { name: /^Clear \d/ })).toBeNull();
  });

  it('Clear N sits with the filter chips after Sort, and counts what is on (#543)', async () => {
    renderApp();
    await openListOnPhone();
    await userEvent.type(screen.getByRole('textbox', { name: 'Search saved jobs' }), 'zzz');
    const filters = screen.getByRole('group', { name: 'Filters' });
    const clear = await within(filters).findByRole('button', { name: 'Clear 1 filter' });
    const search = screen.getByRole('textbox', { name: 'Search saved jobs' });
    // Under the search, after the Remote only and Sort chips.
    expect(search.compareDocumentPosition(clear) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const sort = within(filters).getByRole('button', { name: /^Sort:/ });
    expect(sort.compareDocumentPosition(clear) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(clear).toHaveTextContent(/^Clear 1$/);
    await userEvent.click(within(filters).getByRole('button', { name: 'Remote only' }));
    const clear2 = within(filters).getByRole('button', { name: 'Clear 2 filters' });
    expect(clear2).toHaveTextContent(/^Clear 2$/);
    await userEvent.click(clear2);
    expect(within(filters).queryByRole('button', { name: /^Clear \d/ })).toBeNull();
  });

  it('the five named views, then All jobs, replace the Status select (#541)', async () => {
    renderApp();
    await openListOnPhone();
    expect(screen.queryByRole('button', { name: /^Status:/ })).toBeNull();
    const names = within(screen.getByRole('group', { name: 'Views' }))
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label'));
    expect(names).toEqual([
      'To apply 1',
      'Follow up 1',
      'Interviewing 0',
      'Applied 1',
      'Recently closed 0',
      'All jobs 2',
    ]);
  });
});

// From lg the list is the column beside a job (#471, jobPage.test.tsx); the sheet holds below it.
describe('Pipeline on a tablet: the sheet rows too (Adrian 2026-10-24)', () => {
  beforeEach(() => viewport(800));

  it('is the row list, not a table: status and follow-up badges, no per-row key (#543)', async () => {
    setPipelineView({ filter: 'all' });
    renderApp();
    await openListOnPhone();
    expect(screen.queryByRole('table')).toBeNull();
    const card = row('Zenith Product Designer');
    expect(within(card).getByRole('link', { name: 'Zenith Product Designer' })).toHaveAttribute(
      'href',
      `#/apply/${jobIdOf(APPLIED)}`,
    );
    expect(within(card).getByText('Applied')).toBeInTheDocument();
    expect(within(card).getByText('Follow-up due')).toBeInTheDocument();
    expect(
      within(card).queryByRole('button', { name: 'Follow up: Zenith Product Designer' }),
    ).toBeNull();
  });

  it('a row has no posting glyph by its title (Adrian 2026-11-08, #543)', async () => {
    renderApp();
    await openListOnPhone();
    const card = row('Design Engineer');
    expect(
      within(card).queryByRole('link', { name: 'Open posting for Design Engineer at Acme' }),
    ).toBeNull();
    expect(within(card).getAllByRole('link')).toHaveLength(1);
  });

  it('shows no star on a starred row (#534), and marks retired ones', async () => {
    updateJob(SAVED, { archived: true });
    setPipelineView({ filter: 'all' });
    renderApp();
    await openListOnPhone();
    const starredCard = row('Zenith Product Designer');
    expect(within(starredCard).queryByText('Starred')).toBeNull();
    // Set-aside jobs show under All jobs (#541: no Retired view since the Status select went).
    await userEvent.click(screen.getByRole('button', { name: /^All jobs \d/ }));
    const card = row('Design Engineer');
    expect(within(card).queryByText('Saved')).toBeNull(); // #538: no Saved chip
    expect(within(card).getAllByText(/Retired/).length).toBeGreaterThan(0);
    expect(within(card).queryByText('Starred')).toBeNull();
  });

  it('sorts through the Sort chip, and back', async () => {
    addJob('https://acme.example/jobs/3', 'Writer'); // the newest, but last A–Z
    setPipelineView({ filter: 'all' });
    renderApp();
    await openListOnPhone();
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
    setPipelineView({ filter: 'all' });
    renderApp();
    await openListOnPhone();
    await userEvent.type(screen.getByRole('textbox', { name: 'Search saved jobs' }), 'Zenith');
    // A jump from the sheet opens the job in place and closes it (Proposal A).
    await userEvent.click(within(jobsNav()).getByRole('link', { name: 'Zenith Product Designer' }));
    await waitFor(() => expect(window.location.hash).toBe(`#/apply/${jobIdOf(APPLIED)}`));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'All jobs' })).toBeNull());
    await openAllJobs();
    expect(screen.getByRole('textbox', { name: 'Search saved jobs' })).toHaveValue('Zenith');
    expect(queryRow('Design Engineer')).toBeNull();
  });
});

describe('Pipeline rows keep to two items per dotted line (#192)', () => {
  it('a job with company and location and a retired mark wraps its facts to two per line', async () => {
    viewport(0); // the sheet
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

  it('nothing to apply to is the done state (#554): All jobs opens the view, focus on its job', async () => {
    const user = userEvent.setup();
    // Nothing is to apply to: both jobs are Applied and neither is starred.
    markAppliedByUrl(SAVED, 'Design Engineer');
    updateJob(APPLIED, { priority: false });
    renderApp();
    const done = await screen.findByRole('region', { name: 'That is the list' });
    await user.click(within(done).getByRole('button', { name: 'All jobs' }));
    expect(getPipelineView().filter).toBe('all');
    const h1 = await screen.findByRole('heading', { level: 1, name: /Designer|Engineer/ });
    await waitFor(() => expect(h1).toHaveFocus());
  });

  it('the job menu has no Star or Unstar (#534): the stored star stays in the data', async () => {
    const user = userEvent.setup();
    openJobPage(APPLIED);
    await user.click(
      await screen.findByRole('button', { name: 'More actions: Zenith Product Designer' }),
    );
    const menu = await screen.findByRole('menu');
    expect(within(menu).queryByRole('menuitem', { name: /Star/ })).toBeNull();
    expect(getAllJobs().find((j) => j.url === APPLIED)?.priority).toBe(true);
  });
});
