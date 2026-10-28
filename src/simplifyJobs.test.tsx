// Simplify Jobs (#416, Adrian 2026-10-28): the Jobs page keeps To apply + Start applying, Follow
// up, Next 7 days and the job list; Getting started goes, Recently removed and Export links move
// to the Account menu. The job page is one page (no tabs): Details, Notes, then Documents and
// Decks as plain lists of external links. To-dos, screening and interviews leave the page but
// their data stays; Add interview is one item in the job's menu. Tested at the route seam.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@hirobius/design-system';
import { ColorModeProvider } from './ColorMode';
import App from './App';
import {
  addJob,
  findJobByUrl,
  getAllJobs,
  jobIdOf,
  removeJob,
  replaceAll,
  updateJob,
} from './store';
import { replaceTrash, getTrash } from './trash';
import { dismissNotice } from './saveNotice';
import { ymd } from './jobEvents';
import { toCsv } from './csv';

const URL_A = 'https://acme.example/jobs/7';
const URL_B = 'https://zenith.example/jobs/2';

const renderApp = () =>
  render(
    <ColorModeProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ColorModeProvider>,
  );

const openJobPage = (url = URL_A) => {
  window.location.hash = `#/queue/${jobIdOf(url)}`;
  return renderApp();
};

const openAccount = async () => {
  await userEvent.click(screen.getByRole('button', { name: /^Account/ }));
  return screen.findByRole('menu');
};

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, '', '/');
  window.location.hash = '';
});
afterEach(() => {
  cleanup();
  getAllJobs()
    .slice()
    .forEach((j) => removeJob(j.url));
  replaceTrash([]);
  dismissNotice();
});

describe('the Jobs page keeps only what Adrian listed', () => {
  it('keeps To apply, Follow up and the job list; no Getting started, Export links or Find the next company', async () => {
    addJob(URL_A, 'Design Engineer');
    addJob(URL_B, 'Welder');
    updateJob(URL_B, { status: 'Applied', applied: '2026-01-01' });
    window.location.hash = '#/queue';
    renderApp();
    expect(await screen.findByRole('region', { name: /To apply/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Start applying/ })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /Follow up/ })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Jobs' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Search saved jobs' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Status:/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Sort:/ })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /Getting started/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Export links' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'More job actions' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Find the next company' })).toBeNull();
  });

  it('Recently removed is not on the page: the Account menu opens it', async () => {
    addJob(URL_A, 'Design Engineer');
    addJob(URL_B, 'Welder');
    window.location.hash = '#/queue';
    renderApp();
    let menu = await openAccount();
    expect(within(menu).queryByRole('menuitem', { name: /Recently removed/ })).toBeNull();
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'More actions: Welder' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Remove' }));
    await waitFor(() => expect(getTrash()).toHaveLength(1));
    expect(screen.queryByRole('button', { name: /Recently removed/ })).toBeNull();
    menu = await openAccount();
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Recently removed (1)' }));
    const dialog = await screen.findByRole('dialog', { name: 'Recently removed' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Restore: Welder' }));
    expect(
      getAllJobs()
        .map((j) => j.label)
        .sort(),
    ).toEqual(['Design Engineer', 'Welder']);
  });

  it('Export links lives in the Account menu', async () => {
    addJob(URL_A, 'Design Engineer');
    window.location.hash = '#/queue';
    renderApp();
    const menu = await openAccount();
    expect(within(menu).getByRole('menuitem', { name: 'Export links' })).toBeInTheDocument();
  });
});

describe('the job page is one page', () => {
  it('has no tabs: Details, Notes, Documents and Decks, and no To-dos, Fit or Interviews', () => {
    addJob(URL_A, 'Design Engineer');
    updateJob(URL_A, { company: 'Acme' });
    openJobPage();
    expect(screen.queryByRole('tablist', { name: 'Job sections' })).toBeNull();
    for (const name of ['Overview', 'Screening', /Interviews/])
      expect(screen.queryByRole('tab', { name })).toBeNull();
    for (const name of ['Details', 'Notes', 'Documents', 'Decks'])
      expect(screen.getByRole('region', { name })).toBeInTheDocument();
    for (const name of [/To-dos/, /^Fit/, /Interviews/])
      expect(screen.queryByRole('region', { name })).toBeNull();
    expect(screen.queryByRole('button', { name: /Add a to-do|Add starter tasks/ })).toBeNull();
  });

  it('never deletes to-dos, screening or interviews: they stay on the job, in sync and the CSV', async () => {
    addJob(URL_A, 'Design Engineer');
    updateJob(URL_A, {
      company: 'Acme',
      todos: [{ id: 't1', text: 'Tailor résumé', done: false }],
      verdict: 'match',
      angle: 'Systems lead',
      events: [{ id: 'e1', kind: 'interview', date: '2026-11-03' }],
    });
    openJobPage();
    await userEvent.click(screen.getByRole('button', { name: /Edit details/ }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Pay' }), '100k');
    const job = findJobByUrl(URL_A)!;
    expect(job.todos).toEqual([{ id: 't1', text: 'Tailor résumé', done: false }]);
    expect(job.verdict).toBe('match');
    expect(job.angle).toBe('Systems lead');
    expect(job.events).toEqual([{ id: 'e1', kind: 'interview', date: '2026-11-03' }]);
    const csv = toCsv(getAllJobs());
    expect(csv).toContain('Tailor résumé');
    expect(csv).toContain('2026-11-03');
  });

  it('an old ?section= link opens the one page', () => {
    addJob(URL_A, 'Design Engineer');
    window.location.hash = `#/queue/${jobIdOf(URL_A)}?section=interviews`;
    renderApp();
    expect(screen.getByRole('heading', { level: 2, name: 'Design Engineer' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Notes' })).toBeInTheDocument();
  });
});

describe('Documents and Decks are plain lists of links', () => {
  it('adds a document link with a label, opens it from its name, and Remove has Undo', async () => {
    addJob(URL_A, 'Design Engineer');
    updateJob(URL_A, { company: 'Acme' });
    openJobPage();
    const panel = screen.getByRole('region', { name: 'Documents' });
    await userEvent.click(within(panel).getByRole('button', { name: 'Add a document link' }));
    await userEvent.type(
      within(panel).getByRole('textbox', { name: 'Link' }),
      'https://docs.example/cv',
    );
    await userEvent.type(
      within(panel).getByRole('textbox', { name: 'Label (optional)' }),
      'Résumé',
    );
    await userEvent.click(within(panel).getByRole('button', { name: 'Add link' }));
    expect(findJobByUrl(URL_A)?.docLinks).toEqual([
      expect.objectContaining({ url: 'https://docs.example/cv', label: 'Résumé' }),
    ]);
    const link = within(panel).getByRole('link', { name: /Résumé/ });
    expect(link).toHaveAttribute('href', 'https://docs.example/cv');
    await userEvent.click(within(panel).getByRole('button', { name: 'Remove “Résumé”' }));
    await waitFor(() => expect(findJobByUrl(URL_A)?.docLinks ?? []).toEqual([]));
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    expect(findJobByUrl(URL_A)?.docLinks).toHaveLength(1);
  });

  it('refuses a link that is not http(s)', async () => {
    addJob(URL_A, 'Design Engineer');
    updateJob(URL_A, { company: 'Acme' });
    openJobPage();
    const panel = screen.getByRole('region', { name: 'Decks' });
    await userEvent.click(within(panel).getByRole('button', { name: 'Add a deck link' }));
    await userEvent.type(
      within(panel).getByRole('textbox', { name: 'Link' }),
      'javascript:alert(1)',
    );
    await userEvent.click(within(panel).getByRole('button', { name: 'Add link' }));
    expect(within(panel).getByText(/full link that starts with https/)).toBeInTheDocument();
    expect(findJobByUrl(URL_A)?.decks).toBeUndefined();
  });

  it('lists the decks a job already has, keeping their sent day in storage', () => {
    addJob(URL_A, 'Design Engineer');
    updateJob(URL_A, {
      company: 'Acme',
      decks: [
        { id: 'd1', url: 'https://slides.example/x', label: 'Case study', sentOn: '2026-10-01' },
      ],
    });
    openJobPage();
    const panel = screen.getByRole('region', { name: 'Decks' });
    expect(within(panel).getByRole('link', { name: /Case study/ })).toHaveAttribute(
      'href',
      'https://slides.example/x',
    );
    expect(findJobByUrl(URL_A)?.decks?.[0].sentOn).toBe('2026-10-01');
  });

  it('document links sync with the job: unsafe ones are dropped on read', () => {
    replaceAll([
      {
        url: URL_A,
        label: 'Design Engineer',
        status: 'Saved',
        docLinks: [
          { id: 'a', url: 'https://docs.example/a' },
          { id: 'b', url: 'javascript:alert(1)' },
        ],
      },
    ]);
    expect(findJobByUrl(URL_A)?.docLinks).toEqual([{ id: 'a', url: 'https://docs.example/a' }]);
  });
});

describe('Add interview is one item in the job menu', () => {
  it('the menu adds an interview, which feeds Next 7 days', async () => {
    addJob(URL_A, 'Design Engineer');
    updateJob(URL_A, { company: 'Acme', status: 'Applied', applied: ymd(new Date()) });
    openJobPage();
    const header = screen
      .getByRole('heading', { level: 2, name: 'Design Engineer' })
      .closest('header') as HTMLElement;
    await userEvent.click(within(header).getByRole('button', { name: /^More actions/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Add interview…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add interview' });
    const day = new Date();
    day.setDate(day.getDate() + 2);
    await userEvent.type(within(dialog).getByLabelText('Date'), ymd(day));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add interview' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add interview' })).toBeNull());
    expect(findJobByUrl(URL_A)?.events).toEqual([
      expect.objectContaining({ kind: 'interview', date: ymd(day) }),
    ]);
    // Next 7 days on the Jobs page shows it.
    window.location.hash = '#/queue';
    expect(await screen.findByRole('region', { name: /Next 7 days/ })).toBeInTheDocument();
  });

  it("an Interviewing job's primary is Add interview, which opens the same dialog", async () => {
    addJob(URL_A, 'Design Engineer');
    updateJob(URL_A, { company: 'Acme', status: 'Interviewing', applied: ymd(new Date()) });
    openJobPage();
    await userEvent.click(screen.getByRole('button', { name: 'Add interview' }));
    expect(await screen.findByRole('dialog', { name: 'Add interview' })).toBeInTheDocument();
  });

  it('a Pipeline card menu has Add interview too', async () => {
    addJob(URL_A, 'Design Engineer');
    window.location.hash = '#/queue';
    renderApp();
    await userEvent.click(screen.getByRole('button', { name: 'More actions: Design Engineer' }));
    expect(await screen.findByRole('menuitem', { name: 'Add interview…' })).toBeInTheDocument();
  });

  it('closing it gives focus back to the ⋯ button that opened it', async () => {
    addJob(URL_A, 'Design Engineer');
    window.location.hash = '#/queue';
    renderApp();
    const more = screen.getByRole('button', { name: 'More actions: Design Engineer' });
    await userEvent.click(more);
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Add interview…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add interview' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(more).toHaveFocus());
  });
});

describe('Recently removed from another page', () => {
  it('emptying it hands focus back to the Account button', async () => {
    replaceTrash([
      {
        job: { url: URL_A, label: 'Design Engineer', status: 'Saved' },
        removedAt: new Date().toISOString(),
      },
    ]);
    window.location.hash = '#/copy-deck';
    renderApp();
    const menu = await openAccount();
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Recently removed (1)' }));
    const dialog = await screen.findByRole('dialog', { name: 'Recently removed' });
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Delete forever: Design Engineer' }),
    );
    await waitFor(() => expect(screen.getByRole('button', { name: /^Account/ })).toHaveFocus());
  });
});
