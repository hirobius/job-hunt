// rev-3 A (slice 3): a blank chip in a filled template fills in place. The four job variables save
// on the job; any other on the message (Document.values), where the Variables panel saves them.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import { Button } from '@hirobius/design-system';
import userEvent from '@testing-library/user-event';
import BlankText from './BlankText';
import { createDocument, getAllDocuments, replaceDocuments } from './documents';
import { addJob, getAllJobs, removeJob, useJobs } from './store';
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
    // The warning icon sits inside the warning-toned text, so currentColor tints it.
    expect(screen.getByText('2 blanks left').querySelector('svg')).not.toBeNull();
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
    // Fill is always enabled (rev-3 A) and ignores an empty value.
    expect(screen.getByRole('button', { name: 'Fill' })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Fill' }));
    expect(getAllDocuments().find((d) => d.id === id)?.values ?? {}).toEqual({});
    await userEvent.type(screen.getByRole('textbox', { name: 'Pet' }), 'Rex');
    await userEvent.click(screen.getByRole('button', { name: 'Fill' }));
    expect(getAllDocuments().find((d) => d.id === id)?.values).toEqual({ pet: 'Rex' });
    expect(job().contact).toBeUndefined();
  });
});

// QA: after a fill the field unmounts; focus went to the dialog itself (a heavy outline round the
// whole Follow up sheet). It goes to the next open blank, else to the copy action.
describe('focus after a fill', () => {
  /** The text refills from the live job, as the Follow up dialog and Apply mode do. */
  function Live({ body, id, action }: { body: string; id: string; action?: boolean }) {
    const j = useJobs().find((x) => x.url === JOB)!;
    const copy = useRef<HTMLButtonElement>(null);
    return (
      <>
        <BlankText
          text={fillSnippet({ body }, j)}
          job={j}
          documentId={id}
          nextFocus={action ? undefined : copy}
          action={action ? <Button variant="secondary">Copy row</Button> : undefined}
        />
        <Button variant="primary" ref={copy}>
          Copy message
        </Button>
      </>
    );
  }

  it('moves to the next open blank, then to the copy button', async () => {
    const id = createDocument({ kind: 'outreach', title: 'Note', base: true, text: '' });
    render(<Live body="Hi [Contact], about [Angle]" id={id} />);
    await userEvent.click(screen.getByRole('button', { name: 'Fill Contact' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Contact' }), 'Dana{Enter}');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Fill Angle' })).toHaveFocus());
    await userEvent.click(screen.getByRole('button', { name: 'Fill Angle' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Angle' }), 'Fab work');
    await userEvent.click(screen.getByRole('button', { name: 'Fill' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Copy message' })).toHaveFocus());
  });

  it("with no target given, the row's own action takes focus", async () => {
    const id = createDocument({ kind: 'outreach', title: 'Note', base: true, text: '' });
    render(<Live body="Hi [Contact]" id={id} action />);
    await userEvent.click(screen.getByRole('button', { name: 'Fill Contact' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Contact' }), 'Dana{Enter}');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Copy row' })).toHaveFocus());
  });

  it('Escape closes the field and gives focus back to its blank', async () => {
    const id = createDocument({ kind: 'outreach', title: 'Note', base: true, text: '' });
    render(<Live body="Hi [Contact]" id={id} />);
    await userEvent.click(screen.getByRole('button', { name: 'Fill Contact' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Contact' }), '{Escape}');
    expect(screen.queryByRole('textbox', { name: 'Contact' })).toBeNull();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Fill Contact' })).toHaveFocus());
  });
});
