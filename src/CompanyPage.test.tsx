// The Company page (#230), rendered standalone: its Jobs, Documents and Notes, and Notes that can
// be added and edited (each save a Version). The shell route (#/company/<slug>) wires it in later.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import CompanyPage from './CompanyPage';
import { addJob, getAllJobs, jobIdOf, removeJob, updateJob } from './store';
import { createDocument, getAllDocuments, replaceDocuments } from './documents';
import { addCompanyNote } from './companies';
import { jobHash } from './route';

const URL_A = 'https://acme.example/jobs/7';
const URL_B = 'https://acme.example/jobs/8';

beforeEach(() => {
  localStorage.clear();
  replaceDocuments([]);
});
afterEach(() => {
  cleanup();
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
