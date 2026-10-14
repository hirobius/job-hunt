// Phase 3 of the redesign (#129): the Pipeline list. Tested at the route seam through App and
// driven by role + name. A phone gets compact cards whose title owns its row; a desktop gets a
// sortable table. Either way each job links to its page and has one primary action, with the
// rest in its menu.
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
  window.location.hash = '#/queue';
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

  it('shows compact cards: the title is a link to the job page on a row of its own', () => {
    renderApp();
    expect(screen.queryByRole('table')).toBeNull();
    const card = screen.getByRole('article', { name: 'Design Engineer' });
    const title = within(card).getByRole('link', { name: 'Design Engineer' });
    expect(title).toHaveAttribute('href', `#/queue/${jobIdOf(SAVED)}`);
    // Nothing shares the title's row: its heading holds the link alone.
    expect(title.closest('h3')!.textContent).toBe('Design Engineer');
  });

  it('each card has one primary action, the rest in its menu', async () => {
    renderApp();
    const saved = screen.getByRole('article', { name: 'Design Engineer' });
    expect(
      within(saved).getByRole('button', { name: 'Mark applied: Design Engineer' }),
    ).toBeInTheDocument();
    const applied = screen.getByRole('article', { name: 'Zenith Product Designer' });
    expect(
      within(applied).getByRole('button', { name: 'Log follow-up: Zenith Product Designer' }),
    ).toBeInTheDocument();

    await userEvent.click(
      within(saved).getByRole('button', { name: 'More actions: Design Engineer' }),
    );
    const items = within(await screen.findByRole('menu'))
      .getAllByRole('menuitem')
      .map((i) => i.textContent?.trim());
    expect(items).toEqual([
      'Open posting',
      'Pin as priority',
      'Retire',
      'Find more like this',
      'Remove',
    ]);
  });

  it('Mark applied moves the job out of the Active view', async () => {
    renderApp();
    await userEvent.click(screen.getByRole('button', { name: 'Mark applied: Design Engineer' }));
    expect(getAllJobs().find((j) => j.url === SAVED)?.status).toBe('Applied');
    expect(screen.queryByRole('article', { name: 'Design Engineer' })).toBeNull();
  });
});

describe('Pipeline on a desktop (#129)', () => {
  beforeEach(() => viewport(1440));

  it('is a table: job, status, fit, applied, follow-up, and one action per row', () => {
    renderApp();
    const table = screen.getByRole('table', { name: 'Saved jobs' });
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((c) => c.textContent?.trim());
    expect(headers).toEqual(['Job', 'Status', 'Fit', 'Applied', 'Follow-up', 'Actions']);
    const row = within(table).getByRole('row', { name: /Zenith Product Designer/ });
    expect(within(row).getByRole('link', { name: 'Zenith Product Designer' })).toHaveAttribute(
      'href',
      `#/queue/${jobIdOf(APPLIED)}`,
    );
    expect(within(row).getByText('Applied')).toBeInTheDocument();
    expect(within(row).getByText('10d ago')).toBeInTheDocument();
    expect(within(row).getByText('Due')).toBeInTheDocument();
    expect(
      within(row).getByRole('button', { name: 'Log follow-up: Zenith Product Designer' }),
    ).toBeInTheDocument();
  });

  it('sorts by a column header through the same sort as the toolbar, and back', async () => {
    addJob('https://acme.example/jobs/3', 'Writer'); // the newest, but last A–Z
    renderApp();
    const table = () => screen.getByRole('table', { name: 'Saved jobs' });
    const titles = () =>
      within(table())
        .getAllByRole('link')
        .map((l) => l.textContent);
    // Default: the pinned job with a due follow-up first, then most recently added.
    expect(titles()).toEqual(['Zenith Product Designer', 'Writer', 'Design Engineer']);
    const jobHeader = within(table()).getByRole('columnheader', { name: /Job/ });
    await userEvent.click(within(jobHeader).getByRole('button'));
    await waitFor(() => expect(jobHeader).toHaveAttribute('aria-sort', 'ascending'));
    expect(screen.getByRole('button', { name: 'Sort: A–Z' })).toBeInTheDocument();
    // Priority still floats in every sort (jobSort's invariant); A–Z orders the rest.
    expect(titles()).toEqual(['Zenith Product Designer', 'Design Engineer', 'Writer']);
    await userEvent.click(within(jobHeader).getByRole('button'));
    await waitFor(() => expect(jobHeader).toHaveAttribute('aria-sort', 'none'));
    expect(screen.getByRole('button', { name: 'Sort: Recently added' })).toBeInTheDocument();
  });
});
