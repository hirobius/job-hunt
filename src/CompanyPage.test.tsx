// The Company page (#230), rendered standalone: its Jobs, Documents and Notes, and Notes that can
// be added and edited (each save a Version). The shell route (#/company/<slug>) wires it in later.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { ToastProvider } from '@hirobius/design-system';
import CompanyPage from './CompanyPage';
import NoticeHost from './NoticeHost';
import { addJob, getAllJobs, jobIdOf, removeJob, updateJob } from './store';
import { addFinalCopy, createDocument, getAllDocuments, replaceDocuments } from './documents';
import { addCompanyNote } from './companies';
import { jobHash } from './route';
import { CloudSyncContext, type CloudSyncApi } from './account/accountContext';

const URL_A = 'https://acme.example/jobs/7';
const URL_B = 'https://acme.example/jobs/8';

beforeEach(() => {
  localStorage.clear();
  replaceDocuments([]);
});
afterEach(() => {
  cleanup();
  window.location.hash = '';
  getAllJobs()
    .slice()
    .forEach((j) => removeJob(j.url));
  replaceDocuments([]);
});

const seedAcme = () => {
  addJob(URL_A, 'Design Engineer');
  updateJob(URL_A, { company: 'Acme, Inc.' });
  addJob(URL_B, 'Staff Designer');
  updateJob(URL_B, { company: 'ACME' });
  createDocument({ kind: 'cover', title: 'Acme cover', jobUrl: URL_A, text: 'Dear Acme' });
};

describe('Company page (#230)', () => {
  it("shows the company's name, its Jobs (linked to their pages) and its Documents", () => {
    seedAcme();
    render(<CompanyPage slug="acme" />);
    expect(screen.getByRole('heading', { level: 2, name: 'Acme, Inc.' })).toBeInTheDocument();
    const jobs = screen.getByRole('region', { name: 'Jobs' });
    expect(within(jobs).getByRole('link', { name: 'Design Engineer' })).toHaveAttribute(
      'href',
      jobHash(jobIdOf(URL_A)),
    );
    expect(within(jobs).getByRole('link', { name: 'Staff Designer' })).toBeInTheDocument();
    const docs = screen.getByRole('region', { name: 'Documents' });
    expect(within(docs).getByText('Acme cover')).toBeInTheDocument();
    expect(within(docs).getByText(/Cover letter/)).toBeInTheDocument();
  });

  it('rev-3 panels: Jobs and Documents with count badges, job rows like Pipeline cards, Back on the edge', async () => {
    seedAcme();
    render(<CompanyPage slug="acme" />);
    expect(screen.getByRole('link', { name: 'Back to Pipeline' })).toHaveAttribute(
      'href',
      '#/queue',
    );
    expect(screen.getByRole('link', { name: 'Back to Pipeline' })).toHaveTextContent(/^Pipeline$/);
    const jobs = screen.getByRole('region', { name: 'Jobs' });
    expect(within(jobs).getByText('2')).toBeInTheDocument();
    const rows = within(jobs).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    // Each row: its status badge above the title, and the one next step.
    expect(within(rows[0]).getByText('Saved')).toBeInTheDocument();
    expect(within(rows[0]).getByRole('button', { name: /^Mark applied: / })).toBeInTheDocument();
    const docs = screen.getByRole('region', { name: 'Documents' });
    expect(within(docs).getByText('1')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Notes' })).toBeInTheDocument();
  });

  it('each job row opens its posting in one tap from beside the title (Adrian 2026-10-22)', () => {
    seedAcme();
    render(<CompanyPage slug="acme" />);
    const jobs = screen.getByRole('region', { name: 'Jobs' });
    const posting = within(jobs).getByRole('link', {
      name: 'Open posting for Design Engineer at Acme, Inc.',
    });
    expect(posting).toHaveAttribute('href', URL_A);
    expect(posting).toHaveAttribute('target', '_blank');
    expect(posting.closest('h4')).toBeNull();
    expect(
      within(jobs).getByRole('link', { name: 'Open posting for Staff Designer at ACME' }),
    ).toHaveAttribute('href', URL_B);
  });

  it("each Documents row opens where it is edited: a job's document, its job page, whose Back names the company (#304, #328)", () => {
    seedAcme();
    window.location.hash = '#/company/acme';
    render(<CompanyPage slug="acme" />);
    const docs = screen.getByRole('region', { name: 'Documents' });
    const link = within(docs).getByRole('link', { name: 'Acme cover' });
    expect(link).toHaveAttribute('href', `${jobHash(jobIdOf(URL_A))}?from=%2Fcompany%2Facme`);
  });

  it('an empty Documents panel says so in one line', () => {
    addCompanyNote('Bolt', 'Keep in touch');
    render(<CompanyPage slug="bolt" />);
    expect(
      within(screen.getByRole('region', { name: 'Documents' })).getByText('None sent yet.'),
    ).toBeInTheDocument();
  });

  it('adds a company note: a note Document on the company, with no job', async () => {
    seedAcme();
    render(<CompanyPage slug="acme" />);
    const notes = screen.getByRole('region', { name: 'Notes' });
    // Rev-3 mock: the field and a Save note, no "No notes yet" or label line above it.
    expect(within(notes).queryByText(/No notes yet|New note/)).toBeNull();
    const add = within(notes).getByRole('button', { name: 'Save note' });
    expect(add).toBeDisabled();
    await userEvent.type(within(notes).getByLabelText('New note'), 'Hiring manager is Sam');
    await userEvent.click(add);
    const [note] = getAllDocuments().filter((d) => d.kind === 'note');
    expect(note).toMatchObject({ company: 'Acme, Inc.' });
    expect(note.jobUrl).toBeUndefined();
    expect(within(notes).getByLabelText('Note')).toHaveValue('Hiring manager is Sam');
    expect(within(notes).getByLabelText('New note')).toHaveValue('');
  });

  it('editing a note and saving adds a Version; the earlier text is kept', async () => {
    seedAcme();
    const id = addCompanyNote('Acme', 'First');
    render(<CompanyPage slug="acme" />);
    const notes = screen.getByRole('region', { name: 'Notes' });
    const save = within(notes).getByRole('button', { name: 'Save note' });
    expect(save).toBeDisabled(); // nothing changed
    const field = within(notes).getByLabelText('Note');
    await userEvent.clear(field);
    await userEvent.type(field, 'Second');
    await userEvent.click(save);
    const d = getAllDocuments().find((x) => x.id === id)!;
    expect(d.versions.map((v) => v.text)).toEqual(['First', 'Second']);
    expect(within(notes).getByText(/2 versions/)).toBeInTheDocument();
  });

  it('each note has its own name when there are several (#305)', () => {
    addCompanyNote('Bolt', 'One');
    addCompanyNote('Bolt', 'Two');
    render(<CompanyPage slug="bolt" />);
    const notes = screen.getByRole('region', { name: 'Notes' });
    expect(within(notes).getByLabelText('Note 1 of 2')).toHaveValue('One');
    expect(within(notes).getByLabelText('Note 2 of 2')).toHaveValue('Two');
    expect(within(notes).getByRole('button', { name: 'Remove note 2 of 2' })).toBeInTheDocument();
  });

  it('Remove on a note: it goes, a notice says so, and Undo puts it back in its place (#305)', async () => {
    addCompanyNote('Bolt', 'One');
    const two = addCompanyNote('Bolt', 'Two');
    addCompanyNote('Bolt', 'Three');
    render(
      <ToastProvider>
        <NoticeHost />
        <CompanyPage slug="bolt" />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Remove note 2 of 3' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(getAllDocuments().some((d) => d.id === two)).toBe(false);
    expect(screen.getByLabelText('Note 2 of 2')).toHaveValue('Three');
    expect(await screen.findByText('Removed the note')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByLabelText('Note 2 of 3')).toHaveValue('Two');
    expect(
      getAllDocuments()
        .filter((d) => d.kind === 'note')
        .map((d) => d.id)[1],
    ).toBe(two);
  });

  it("removing a notes-only company's last note goes back; Undo reopens the page (#305)", async () => {
    const id = addCompanyNote('Bolt', 'Only');
    window.location.hash = '#/company/bolt';
    render(
      <ToastProvider>
        <NoticeHost />
        <CompanyPage slug="bolt" />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Remove note' }));
    expect(getAllDocuments().some((d) => d.id === id)).toBe(false);
    await waitFor(() => expect(window.location.hash).toBe('#/queue'));
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    expect(getAllDocuments().some((d) => d.id === id)).toBe(true);
    await waitFor(() => expect(window.location.hash).toBe('#/company/bolt'));
  });

  it('an uploaded final copy is listed but not linked to the text editor', () => {
    seedAcme();
    addFinalCopy({
      kind: 'resume',
      jobUrl: URL_A,
      file: { name: 'cv.pdf', type: 'application/pdf', size: 3, data: 'AAAA' },
    });
    render(<CompanyPage slug="acme" />);
    const docs = screen.getByRole('region', { name: 'Documents' });
    expect(within(docs).getByText('cv.pdf')).toBeInTheDocument();
    expect(within(docs).queryByRole('link', { name: 'cv.pdf' })).toBeNull();
    expect(within(docs).getByRole('link', { name: 'Acme cover' })).toBeInTheDocument();
  });

  it('a company with only notes still has its page (nothing orphaned after a rename)', () => {
    addCompanyNote('Bolt', 'Keep in touch');
    render(<CompanyPage slug="bolt" />);
    expect(screen.getByRole('heading', { level: 2, name: 'Bolt' })).toBeInTheDocument();
    expect(screen.getByText(/No jobs at this company/)).toBeInTheDocument();
    expect(screen.getByLabelText('Note')).toHaveValue('Keep in touch');
  });

  it('an unknown company says so, with a way back to the Pipeline', () => {
    render(<CompanyPage slug="nobody" />);
    expect(screen.getByText('No company here')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to the Pipeline' })).toHaveAttribute(
      'href',
      '#/queue',
    );
  });

  it('an unknown company waits for sync to settle before saying so (#303)', () => {
    const withSync = (settled: boolean) => (
      <CloudSyncContext.Provider value={{ settled } as CloudSyncApi}>
        <CompanyPage slug="acme" />
      </CloudSyncContext.Provider>
    );
    const r = render(withSync(false));
    expect(screen.queryByText('No company here')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Go to the Pipeline' })).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent(/Looking for this company/);
    // The company's jobs arrive with the pull: the page shows it, no empty state on the way.
    seedAcme();
    r.rerender(withSync(false));
    expect(screen.getByRole('heading', { level: 2, name: 'Acme, Inc.' })).toBeInTheDocument();
    getAllJobs()
      .slice()
      .forEach((j) => removeJob(j.url));
    r.rerender(withSync(true));
    expect(screen.getByText('No company here')).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    seedAcme();
    addCompanyNote('Acme', 'First');
    const { container } = render(<CompanyPage slug="acme" />);
    const r = await axe(container, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    });
    expect(r.violations.map((v) => `${v.id} x${v.nodes.length}`)).toEqual([]);
  });
});
