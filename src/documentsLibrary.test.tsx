// The Documents library (#227), rendered standalone (it is wired into the Templates tab later):
// Base documents grouped by kind, an empty state per kind, create, edit (each save is a new
// Version, with a Version history), delete behind an AlertDialog, and for Outreach messages the
// token chips and the preview filled for a picked job.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@hirobius/design-system';
import DocumentsLibrary from './DocumentsLibrary';
import { createDocument, getAllDocuments, replaceDocuments, setDocumentPinned } from './documents';
import { addJob, getAllJobs, removeJob, updateJob } from './store';

const JOB = 'https://acme.example/jobs/1';

const renderLib = () =>
  render(
    <ToastProvider>
      <DocumentsLibrary />
    </ToastProvider>,
  );
const section = (name: string) => screen.getByRole('region', { name });
const doc = (id: string) => getAllDocuments().find((d) => d.id === id)!;

// Radix Select measures and scrolls; jsdom has neither.
beforeEach(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  localStorage.clear();
  replaceDocuments([]);
});
afterEach(() => {
  cleanup();
  getAllJobs()
    .slice()
    .forEach((j) => removeJob(j.url));
});

describe('library', () => {
  it('shows a section per kind, each with its own empty state and a New button', () => {
    renderLib();
    for (const [name, empty, button] of [
      ['Résumés', 'No résumés yet', 'New résumé'],
      ['Cover letters', 'No cover letters yet', 'New cover letter'],
      ['Notes', 'No notes yet', 'New note'],
      ['Outreach messages', 'No outreach messages yet', 'New outreach message'],
    ]) {
      const s = section(name);
      expect(within(s).getByText(empty)).toBeInTheDocument();
      expect(within(s).getByRole('button', { name: button })).toBeInTheDocument();
    }
  });

  it('lists Base documents under their kind, pinned first; a job’s own documents stay out', () => {
    createDocument({ kind: 'cover', title: 'Bravo letter', base: true, text: 'b' });
    const a = createDocument({ kind: 'cover', title: 'Zulu letter', base: true, text: 'z' });
    setDocumentPinned(a, true);
    createDocument({ kind: 'cover', title: 'For Acme', jobUrl: JOB, text: 'x' });
    createDocument({ kind: 'resume', title: 'Main résumé', base: true, text: 'r' });
    renderLib();
    const list = within(section('Cover letters')).getByRole('list');
    const covers = within(list).getAllByRole('button');
    expect(covers.map((b) => b.textContent)).toEqual([
      expect.stringContaining('Zulu letter'),
      expect.stringContaining('Bravo letter'),
    ]);
    expect(screen.queryByText('For Acme')).not.toBeInTheDocument();
    expect(within(section('Résumés')).getByText('Main résumé')).toBeInTheDocument();
    expect(within(section('Notes')).getByText('No notes yet')).toBeInTheDocument();
  });
});

describe('create, edit, delete', () => {
  it('creates a Base document on its first save', async () => {
    renderLib();
    await userEvent.click(
      within(section('Cover letters')).getByRole('button', { name: 'New cover letter' }),
    );
    expect(getAllDocuments()).toHaveLength(0);
    const title = screen.getByRole('textbox', { name: 'Title' });
    await userEvent.clear(title);
    await userEvent.type(title, 'General letter');
    await userEvent.type(screen.getByRole('textbox', { name: 'Text' }), 'Dear team');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    const [d] = getAllDocuments();
    expect(d).toMatchObject({ kind: 'cover', title: 'General letter', base: true });
    expect(d.versions.map((v) => v.text)).toEqual(['Dear team']);
  });

  it('each save adds a Version; the history shows them and an earlier one can be read', async () => {
    const id = createDocument({ kind: 'note', title: 'Prep', base: true, text: 'first' });
    renderLib();
    await userEvent.click(screen.getByRole('button', { name: /Prep/ }));
    const text = screen.getByRole('textbox', { name: 'Text' });
    expect(text).toHaveValue('first');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await userEvent.clear(text);
    await userEvent.type(text, 'second');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(doc(id).versions.map((v) => v.text)).toEqual(['first', 'second']);

    await userEvent.click(screen.getByRole('button', { name: /Version history \(2\)/ }));
    const versions = screen.getAllByRole('button', { name: /^Version \d+ ·/ });
    expect(versions.map((b) => b.textContent)).toEqual([
      expect.stringMatching(/^Version 2/),
      expect.stringMatching(/^Version 1/),
    ]);
    await userEvent.click(versions[1]);
    expect(screen.getByRole('region', { name: 'Version 1' })).toHaveTextContent('first');
    await userEvent.click(screen.getByRole('button', { name: 'Use this text' }));
    expect(text).toHaveValue('first');
  });

  it('renames on blur without adding a Version', async () => {
    const id = createDocument({ kind: 'resume', title: 'CV', base: true, text: 't' });
    renderLib();
    await userEvent.click(screen.getByRole('button', { name: /CV/ }));
    const title = screen.getByRole('textbox', { name: 'Title' });
    await userEvent.type(title, ' 2026');
    await userEvent.tab();
    expect(doc(id)).toMatchObject({ title: 'CV 2026' });
    expect(doc(id).versions).toHaveLength(1);
  });

  it('delete asks first, then removes the document and returns to the library', async () => {
    createDocument({ kind: 'resume', title: 'Old CV', base: true, text: 't' });
    renderLib();
    await userEvent.click(screen.getByRole('button', { name: /Old CV/ }));
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(getAllDocuments()).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    await userEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }),
    );
    expect(getAllDocuments()).toHaveLength(0);
    await waitFor(() => expect(section('Résumés')).toHaveTextContent('No résumés yet'));
  });

  it('Back returns to the library without saving', async () => {
    const id = createDocument({ kind: 'note', title: 'Prep', base: true, text: 'a' });
    renderLib();
    await userEvent.click(screen.getByRole('button', { name: /Prep/ }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Text' }), 'bc');
    await userEvent.click(screen.getByRole('button', { name: 'All documents' }));
    expect(section('Notes')).toBeInTheDocument();
    expect(doc(id).versions).toHaveLength(1);
  });
});

describe('Outreach messages', () => {
  it('token chips insert a variable and the preview fills it for a picked job', async () => {
    addJob(JOB, 'Fabricator');
    updateJob(JOB, { company: 'Acme Metals' });
    const id = createDocument({ kind: 'outreach', title: 'Hello', base: true, text: 'Hi at' });
    renderLib();
    await userEvent.click(screen.getByRole('button', { name: /Hello/ }));
    for (const t of ['[Company]', '[Role]', '[Contact]', '[Angle]', '[Your name]'])
      expect(screen.getByRole('button', { name: t })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '[Company]' }));
    expect(screen.getByRole('textbox', { name: 'Message text' })).toHaveTextContent('Company');
    const preview = screen.getByRole('region', { name: 'Preview' });
    expect(preview).toHaveTextContent('Hi at [Company]');
    await userEvent.click(screen.getByRole('combobox', { name: /^Fill for/ }));
    await userEvent.click(await screen.findByRole('option', { name: /Fabricator/ }));
    expect(preview).toHaveTextContent('Hi at Acme Metals');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(doc(id).versions[doc(id).versions.length - 1].text).toBe('Hi at [Company]');
  });

  it('a migrated message fills from its own variable values', async () => {
    replaceDocuments([
      {
        id: 'snippet-a',
        kind: 'outreach',
        title: 'Pet note',
        base: true,
        values: { pet: 'Rex' },
        createdAt: '2026-10-01T00:00:00.000Z',
        versions: [{ id: 'v1', text: 'Hello [Pet]', savedAt: '2026-10-01T00:00:00.000Z' }],
      },
    ]);
    renderLib();
    await userEvent.click(screen.getByRole('button', { name: /Pet note/ }));
    expect(screen.getByRole('region', { name: 'Preview' })).toHaveTextContent('Hello Rex');
  });
});
