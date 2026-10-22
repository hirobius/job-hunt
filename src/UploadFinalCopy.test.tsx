// Upload a final copy (#231): pick a kind and a PDF/Word file, optionally mark it Sent; download
// it back; remove it unless it is Sent (with Undo, #212).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@hirobius/design-system';
import { FinalCopies, UploadFinalCopy } from './UploadFinalCopy';
import NoticeHost from './NoticeHost';
import { addFinalCopy, getAllDocuments, markSent, replaceDocuments } from './documents';

const JOB = 'https://acme.example/jobs/1';
const pdf = (name = 'cover.pdf', bytes = 8) =>
  new File([new Uint8Array(bytes)], name, { type: 'application/pdf' });

const pick = async (f: File) => {
  // The native picker behind "Choose file"; applyAccept off so a wrong type reaches our check.
  const input = screen.getByLabelText('Choose a file to upload') as HTMLInputElement;
  await userEvent.setup({ applyAccept: false }).upload(input, f);
};

beforeEach(() => {
  // Radix Select needs these, and jsdom lacks them.
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
  localStorage.clear();
  replaceDocuments([]);
});
afterEach(cleanup);

describe('UploadFinalCopy', () => {
  it('uploads a PDF as a final copy of the chosen kind, marked Sent', async () => {
    const user = userEvent.setup();
    render(<UploadFinalCopy jobUrl={JOB} />);
    await user.click(screen.getByRole('combobox', { name: /^Kind/ }));
    await user.click(await screen.findByRole('option', { name: 'Résumé' }));
    await pick(pdf('cv.pdf'));
    expect(screen.getByText(/cv\.pdf/)).toBeTruthy();
    await user.click(screen.getByRole('checkbox', { name: 'Mark as Sent' }));
    await user.click(screen.getByRole('button', { name: 'Upload' }));
    await waitFor(() => expect(getAllDocuments()).toHaveLength(1));
    const d = getAllDocuments()[0];
    expect(d).toMatchObject({ kind: 'resume', title: 'cv.pdf', jobUrl: JOB });
    expect(d.versions[0].file).toMatchObject({ name: 'cv.pdf', size: 8 });
    expect(d.versions[0].sentAt).toBeTruthy();
    expect(await screen.findByText('Uploaded cv.pdf, marked Sent.')).toBeTruthy();
  });

  it('refuses a file that is not PDF or Word, loudly, and saves nothing', async () => {
    render(<UploadFinalCopy jobUrl={JOB} />);
    await pick(new File(['x'], 'me.png', { type: 'image/png' }));
    expect(screen.getByRole('alert').textContent).toContain(
      'Only PDF or Word files can be uploaded.',
    );
    expect(screen.getByRole('button', { name: 'Upload' })).toHaveProperty('disabled', true);
    expect(getAllDocuments()).toEqual([]);
  });

  it('names the size when a file is too big', async () => {
    render(<UploadFinalCopy jobUrl={JOB} />);
    await pick(pdf('big.pdf', 600 * 1024));
    expect(screen.getByRole('alert').textContent).toContain(
      'That file is 600 KB. Uploads can be up to 500 KB.',
    );
  });

  it('says so when Sent is refused because the job already has a Sent copy of that kind', async () => {
    const first = addFinalCopy({
      kind: 'cover',
      jobUrl: JOB,
      file: { name: 'a.pdf', type: 'application/pdf', size: 3, data: 'AAAA' },
    });
    if (!first.ok) throw new Error(first.error);
    markSent(first.id, first.versionId);
    const user = userEvent.setup();
    render(<UploadFinalCopy jobUrl={JOB} />);
    await pick(pdf('b.pdf'));
    await user.click(screen.getByRole('checkbox', { name: 'Mark as Sent' }));
    await user.click(screen.getByRole('button', { name: 'Upload' }));
    expect(
      await screen.findByText(
        'Uploaded b.pdf. Not marked Sent: this job already has a Sent cover letter.',
      ),
    ).toBeTruthy();
    expect(getAllDocuments()).toHaveLength(2);
  });
});

describe('FinalCopies', () => {
  const add = (name: string) => {
    const r = addFinalCopy({
      kind: 'cover',
      jobUrl: JOB,
      file: { name, type: 'application/pdf', size: 3, data: 'AAAA' },
    });
    if (!r.ok) throw new Error(r.error);
    return r;
  };

  it('downloads a final copy back as its file', async () => {
    add('cover.pdf');
    // jsdom has no object URLs: stand them in for this test, then put back what was there.
    const saved = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
    const create = vi.fn((_b: Blob) => 'blob:x');
    URL.createObjectURL = create;
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<FinalCopies jobUrl={JOB} />);
    await userEvent.click(screen.getByRole('button', { name: 'Download cover.pdf' }));
    expect(create).toHaveBeenCalledOnce();
    const blob = create.mock.calls[0][0];
    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBe(3);
    expect(click).toHaveBeenCalledOnce();
    click.mockRestore();
    URL.createObjectURL = saved.create;
    URL.revokeObjectURL = saved.revoke ?? (() => {}); // download() revokes a beat later
  });

  it('Remove on an unsent copy collapses it, says so, and Undo puts it back; a Sent one is locked', async () => {
    add('first.pdf');
    add('draft.pdf');
    const sent = add('sent.pdf');
    markSent(sent.id, sent.versionId);
    render(
      <ToastProvider>
        <NoticeHost />
        <FinalCopies jobUrl={JOB} />
      </ToastProvider>,
    );
    const sentRow = screen.getByText('sent.pdf').closest('li')!;
    expect(within(sentRow).queryByRole('button', { name: /Remove/ })).toBeNull();
    expect(within(sentRow).getByText('Sent')).toBeTruthy();
    // #212: no "can't be undone" confirm; the file goes at once, with Undo.
    await userEvent.click(screen.getByRole('button', { name: 'Remove draft.pdf' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(getAllDocuments().map((d) => d.title)).toEqual(['first.pdf', 'sent.pdf']);
    expect(screen.queryByText('draft.pdf')).toBeNull();
    expect(await screen.findByText('Removed “draft.pdf”')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(getAllDocuments().map((d) => d.title)).toEqual(['first.pdf', 'draft.pdf', 'sent.pdf']);
    expect(getAllDocuments()[1].versions[0].file).toMatchObject({ name: 'draft.pdf', size: 3 });
    expect(screen.getByText('draft.pdf')).toBeTruthy();
  });

  it('shows nothing for a job with no final copies, and ignores other jobs', () => {
    const r = addFinalCopy({
      kind: 'cover',
      jobUrl: 'https://other.example/j',
      file: { name: 'x.pdf', type: 'application/pdf', size: 3, data: 'AAAA' },
    });
    expect(r.ok).toBe(true);
    const { container } = render(<FinalCopies jobUrl={JOB} />);
    expect(container.textContent).toBe('');
  });
});
