// rev-3 A (slice 3): a blank chip in a filled template fills in place. The four job variables save
// on the job; any other on the message (Document.values), where the Variables panel saves them.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BlankText from './BlankText';
import { createDocument, getAllDocuments, replaceDocuments } from './documents';
import { addJob, getAllJobs, removeJob } from './store';
import { fillSnippet } from './templateFill';

const JOB = 'https://acme.example/jobs/1';
const job = () => getAllJobs().find((j) => j.url === JOB)!;

beforeEach(() => {
  localStorage.clear();
  replaceDocuments([]);
  addJob(JOB, 'Fabricator');
});
afterEach(() => {
  cleanup();
  getAllJobs()
    .slice()
    .forEach((j) => removeJob(j.url));
});

describe('BlankText', () => {
  it('shows blanks as chips and how many are left', () => {
    render(<BlankText text="Hi [Contact], at [Pet]" />);
    expect(screen.getByText('Contact')).toHaveClass('rjb-chip');
    expect(screen.getByText('2 blanks left')).toBeInTheDocument();
    // Read-only without a job: no button to fill.
    expect(screen.queryByRole('button', { name: 'Fill Contact' })).toBeNull();
  });

  it('a job blank fills on the job', async () => {
    const id = createDocument({
      kind: 'outreach',
      title: 'Note',
      base: true,
      text: 'Hi [Contact]',
    });
    const { rerender } = render(
      <BlankText text={fillSnippet({ body: 'Hi [Contact]' }, job())} job={job()} documentId={id} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Fill Contact' }));
    expect(screen.getByText(/Saves to this job/)).toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox', { name: 'Contact' }), 'Dana{Enter}');
    expect(job().contact).toBe('Dana');
    rerender(
      <BlankText text={fillSnippet({ body: 'Hi [Contact]' }, job())} job={job()} documentId={id} />,
    );
    expect(screen.getByText('Hi Dana')).toBeInTheDocument();
    expect(screen.queryByText(/blank left/)).toBeNull();
  });

  it('any other blank fills on the message, kept beside its values', async () => {
    const id = createDocument({ kind: 'outreach', title: 'Note', base: true, text: '[Pet]' });
    render(<BlankText text="Hi [Pet]" job={job()} documentId={id} />);
    await userEvent.click(screen.getByRole('button', { name: 'Fill Pet' }));
    expect(screen.getByText(/Saves on this message/)).toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox', { name: 'Pet' }), 'Rex');
    await userEvent.click(screen.getByRole('button', { name: 'Fill' }));
    expect(getAllDocuments().find((d) => d.id === id)?.values).toEqual({ pet: 'Rex' });
    expect(job().contact).toBeUndefined();
  });
});
