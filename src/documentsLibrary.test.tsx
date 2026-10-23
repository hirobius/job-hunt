// The Documents library (#227), rendered standalone (it is wired into the Templates tab later):
// Base documents grouped by kind, an empty state per kind, create, edit (each save is a new
// Version, with a Version history), delete behind an AlertDialog, and for Outreach messages the
// token chips and the preview filled for a picked job.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@hirobius/design-system';
import DocumentsLibrary from './DocumentsLibrary';
import { createDocument, getAllDocuments, replaceDocuments, setDocumentPinned } from './documents';
import { addJob, getAllJobs, removeJob, updateJob } from './store';
import { CloudSyncContext, type CloudSyncApi } from './account/accountContext';

const JOB = 'https://acme.example/jobs/1';

const renderRaw = () =>
  render(
    <ToastProvider>
      <DocumentsLibrary />
    </ToastProvider>,
  );
/** The library with its sections showing: an empty one opens on its empty state, so start blank. */
const renderLib = () => {
  const r = renderRaw();
  const blank = screen.queryByRole('button', { name: 'Start from scratch' });
  if (blank) fireEvent.click(blank);
  return r;
};
const section = (name: string) => screen.getByRole('region', { name });
const doc = (id: string) => getAllDocuments().find((d) => d.id === id)!;
/** A row expands (rev-3 M); its Open button opens the editor. */
async function openDoc(title: string) {
  await userEvent.click(screen.getByRole('button', { name: new RegExp(title) }));
  await userEvent.click(screen.getByRole('button', { name: `Open ${title}` }));
}

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

describe('a clean first run (Adrian 2026-10-22: nothing the user did not create)', () => {
  it('an empty library is one empty state with one setup action, and no sections or starters', () => {
    renderRaw();
    expect(screen.getByText('No documents yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add starter messages' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start from scratch' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Outreach messages' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Résumés' })).toBeNull();
    expect(getAllDocuments()).toEqual([]);
  });

  it('Add starter messages adds the starters once, each under its kind', async () => {
    renderRaw();
    await userEvent.click(screen.getByRole('button', { name: 'Add starter messages' }));
    expect(getAllDocuments().map((d) => d.id)).toEqual([
      'snippet-tpl-outreach',
      'snippet-tpl-cover',
      'snippet-tpl-followup',
      'snippet-tpl-thanks',
      'snippet-tpl-intro-call',
    ]);
    expect(within(section('Outreach messages')).getByText('Outreach note')).toBeInTheDocument();
    expect(within(section('Cover letters')).getByText('Cover letter')).toBeInTheDocument();
    expect(screen.queryByText('No documents yet')).toBeNull();
  });

  it('Start from scratch shows the sections, each with its New button', async () => {
    renderRaw();
    await userEvent.click(screen.getByRole('button', { name: 'Start from scratch' }));
    expect(
      within(section('Résumés')).getByRole('button', { name: 'New résumé' }),
    ).toBeInTheDocument();
    expect(getAllDocuments()).toEqual([]);
  });
});

describe('waits for cloud sync before offering starters (review, finding 3)', () => {
  const withSync = (settled: boolean) => (
    <CloudSyncContext.Provider value={{ settled } as CloudSyncApi}>
      <ToastProvider>
        <DocumentsLibrary />
      </ToastProvider>
    </CloudSyncContext.Provider>
  );

  it('a new device shows no empty state and no Add starter messages until sync settles', () => {
    const r = render(withSync(false));
    expect(screen.queryByText('No documents yet')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add starter messages' })).toBeNull();
    expect(screen.getByLabelText('Loading')).toBeInTheDocument();
    r.rerender(withSync(true));
    expect(screen.getByText('No documents yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add starter messages' })).toBeInTheDocument();
  });

  it('the cloud messages that arrive meanwhile show instead of the empty state', () => {
    const r = render(withSync(false));
    act(() => {
      createDocument({ kind: 'outreach', title: 'My edited intro', base: true, text: 'Hi' });
    });
    r.rerender(withSync(true));
    expect(screen.queryByText('No documents yet')).toBeNull();
    expect(screen.getByText('My edited intro')).toBeInTheDocument();
  });
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
      expect(within(s).getByText(new RegExp(`^${empty}\\.`))).toBeInTheDocument();
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
    const covers = within(list).getAllByRole('button', { expanded: false });
    expect(covers.map((b) => b.textContent)).toEqual([
      expect.stringContaining('Zulu letter'),
      expect.stringContaining('Bravo letter'),
    ]);
    expect(screen.queryByText('For Acme')).not.toBeInTheDocument();
    expect(within(section('Résumés')).getByText('Main résumé')).toBeInTheDocument();
    expect(within(section('Notes')).getByText(/^No notes yet\./)).toBeInTheDocument();
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
    // rev-3 N: the field starts empty with the kind as its placeholder, under "New cover letter".
    expect(title).toHaveValue('');
    expect(title).toHaveAttribute('placeholder', 'Cover letter');
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('New cover letter');
    await userEvent.type(title, 'General letter');
    await userEvent.type(screen.getByRole('textbox', { name: 'Text' }), 'Dear team');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    const [d] = getAllDocuments();
    expect(d).toMatchObject({ kind: 'cover', title: 'General letter', base: true });
    expect(d.versions.map((v) => v.text)).toEqual(['Dear team']);
  });

  it('a new document saved with no title takes its kind as the title', async () => {
    renderLib();
    await userEvent.click(within(section('Notes')).getByRole('button', { name: 'New note' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Text' }), 'Prep');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(getAllDocuments()[0]).toMatchObject({ kind: 'note', title: 'Note' });
  });

  it('each save adds a Version; the history shows them and an earlier one can be read', async () => {
    const id = createDocument({ kind: 'note', title: 'Prep', base: true, text: 'first' });
    renderLib();
    await openDoc('Prep');
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
    // The picked Version can be downloaded as a PDF or Word file (#229).
    expect(screen.getByRole('button', { name: 'Download version 1' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Use this text' }));
    expect(text).toHaveValue('first');
  });

  it('renames on blur without adding a Version', async () => {
    const id = createDocument({ kind: 'resume', title: 'CV', base: true, text: 't' });
    renderLib();
    await openDoc('CV');
    const title = screen.getByRole('textbox', { name: 'Title' });
    await userEvent.type(title, ' 2026');
    await userEvent.tab();
    expect(doc(id)).toMatchObject({ title: 'CV 2026' });
    expect(doc(id).versions).toHaveLength(1);
  });

  it('delete asks first, then removes the document and returns to the library', async () => {
    createDocument({ kind: 'resume', title: 'Old CV', base: true, text: 't' });
    renderLib();
    await openDoc('Old CV');
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    const dialog = await screen.findByRole('alertdialog');
    // The bordered danger button, like every other confirm in the app (rev-3 mock .btn.danger).
    expect(within(dialog).getByRole('button', { name: 'Delete' })).toHaveAttribute(
      'data-variant',
      'secondary',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(getAllDocuments()).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    await userEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }),
    );
    expect(getAllDocuments()).toHaveLength(0);
    await waitFor(() => expect(screen.getByText('No documents yet')).toBeInTheDocument());
  });

  it('Back with an unsaved edit asks first; Discard returns to the library without saving', async () => {
    const id = createDocument({ kind: 'note', title: 'Prep', base: true, text: 'a' });
    renderLib();
    await openDoc('Prep');
    await userEvent.type(screen.getByRole('textbox', { name: 'Text' }), 'bc');
    await userEvent.click(screen.getByRole('button', { name: 'All documents' }));
    const ask = await screen.findByRole('alertdialog', { name: 'Discard changes?' });
    await userEvent.click(within(ask).getByRole('button', { name: 'Discard' }));
    expect(await screen.findByRole('region', { name: 'Notes' })).toBeInTheDocument();
    expect(doc(id).versions).toHaveLength(1);
  });

  it('a new document with nothing in it goes back without asking', async () => {
    renderLib();
    await userEvent.click(screen.getByRole('button', { name: 'New note' }));
    await userEvent.click(await screen.findByRole('button', { name: 'All documents' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(section('Notes')).toBeInTheDocument();
  });
});

describe('Outreach messages', () => {
  it('token chips insert a variable and the preview fills it for a picked job', async () => {
    addJob(JOB, 'Fabricator');
    updateJob(JOB, { company: 'Acme Metals' });
    const id = createDocument({ kind: 'outreach', title: 'Hello', base: true, text: 'Hi at' });
    renderLib();
    await openDoc('Hello');
    for (const t of ['Company', 'Role', 'Contact', 'Angle', 'Your name'])
      expect(screen.getByRole('button', { name: t })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Company' }));
    expect(screen.getByRole('textbox', { name: 'Message text' })).toHaveTextContent('Company');
    const preview = screen.getByRole('region', { name: 'Preview' });
    expect(preview).toHaveTextContent('Hi at Company');
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
    await openDoc('Pet note');
    expect(screen.getByRole('region', { name: 'Preview' })).toHaveTextContent('Hello Rex');
  });
});

// #221's Variables panel, carried over from the Templates editor: each variable the message uses,
// a picked job's four fields saved on the job, every other value saved on the message.
describe('Variables panel', () => {
  const open = async (text: string) => {
    const id = createDocument({ kind: 'outreach', title: 'Vars', base: true, text });
    renderLib();
    await openDoc('Vars');
    return id;
  };
  const vars = () => screen.getByRole('region', { name: 'Variables' });
  const preview = () => screen.getByRole('region', { name: 'Preview' });

  it('lists every variable the message uses', async () => {
    await open('Hi [Contact] at [Company]. [Pet]');
    for (const n of ['Contact', 'Company', 'Pet'])
      expect(within(vars()).getByRole('textbox', { name: n })).toBeInTheDocument();
  });

  it('a value set there fills the preview and is kept on the message, not in its text', async () => {
    const id = await open('Hi [Contact] at [Company]. [Pet]');
    await userEvent.type(within(vars()).getByRole('textbox', { name: 'Pet' }), 'Rex');
    expect(preview()).toHaveTextContent('Hi Contact at Company. Rex');
    expect(doc(id).values).toEqual({ pet: 'Rex' });
    expect(doc(id).versions.map((v) => v.text)).toEqual(['Hi [Contact] at [Company]. [Pet]']);
  });

  // rev-3 A: the preview's open blanks are chips with "N blanks left", never raw [Brackets].
  it('the preview shows open blanks as chips and counts them, with no bracket text', async () => {
    await open('Hi [Contact] at [Company]. [Pet]');
    await userEvent.type(within(vars()).getByRole('textbox', { name: 'Pet' }), 'Rex');
    expect(within(preview()).getByText('Contact')).toHaveClass('rjb-chip');
    expect(within(preview()).getByText('Company')).toHaveClass('rjb-chip');
    expect(preview().textContent).not.toMatch(/\[/);
    expect(within(vars()).getByText('2 blanks left')).toBeInTheDocument();
    expect(screen.queryByText(/Not set yet/)).toBeNull();
    expect(within(vars()).getByText('Preview')).toBeInTheDocument();
  });

  it('opening a document from a scrolled list starts the editor at its head', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    await open('Hi [Contact]');
    expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
    scrollTo.mockRestore();
  });

  it('the Fill for default reads "No job", with no bracket syntax', async () => {
    await open('Hi [Contact]');
    expect(screen.getByRole('combobox', { name: /^Fill for/ })).toHaveTextContent(/^No job$/);
  });

  it('with a job picked, its fields fill and edits are saved on the job', async () => {
    addJob(JOB, 'Fabricator');
    updateJob(JOB, { company: 'Acme Metals' });
    await open('Hi [Contact] at [Company]. [Pet]');
    await userEvent.click(screen.getByRole('combobox', { name: /^Fill for/ }));
    await userEvent.click(await screen.findByRole('option', { name: /Fabricator/ }));
    expect(within(vars()).getByRole('textbox', { name: 'Company' })).toHaveValue('Acme Metals');
    await userEvent.type(within(vars()).getByRole('textbox', { name: 'Contact' }), 'Jo');
    expect(getAllJobs()[0].contact).toBe('Jo');
    expect(preview()).toHaveTextContent('Hi Jo at Acme Metals. Pet');
  });

  it('a variable named [constructor] or [__proto__] renders and can be set', async () => {
    const id = await open('[constructor] [__proto__]');
    await userEvent.type(within(vars()).getByRole('textbox', { name: '__proto__' }), 'P');
    expect(preview()).toHaveTextContent('constructor P');
    expect(Object.prototype.hasOwnProperty.call(doc(id).values, '__proto__')).toBe(true);
  });

  it('a new message has no Variables panel until it is saved', async () => {
    renderLib();
    await userEvent.click(
      within(section('Outreach messages')).getByRole('button', { name: 'New outreach message' }),
    );
    expect(screen.queryByRole('region', { name: 'Variables' })).toBeNull();
    // "Preview" is the box's caption only, not also the panel's title.
    expect(screen.getByText('Fill for a job', { selector: 'h1,h2,h3,h4,h5,h6' })).toBeVisible();
    expect(screen.getAllByText('Preview')).toHaveLength(1);
  });
});

// The chip field and the copy, carried over from the Templates editor (#132, #221).
describe('message text', () => {
  const body = () => screen.getByRole('textbox', { name: 'Message text' });
  const preview = () => screen.getByRole('region', { name: 'Preview' });
  /** Put the caret in the chip editor `at` characters into a text node. */
  function caretAt(node: Node, at: number) {
    const r = document.createRange();
    r.setStart(node, at);
    r.collapse(true);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(r);
    document.dispatchEvent(new Event('selectionchange'));
  }
  const open = async (text: string) => {
    createDocument({ kind: 'outreach', title: 'Chips', base: true, text });
    renderLib();
    await openDoc('Chips');
  };

  it('shows each variable as one named chip that cannot be edited inside', async () => {
    await open('Hi [Contact], at [Company]');
    expect(screen.getByRole('img', { name: 'Contact variable' })).toHaveAttribute(
      'contenteditable',
      'false',
    );
    expect(body()).toHaveTextContent('Hi Contact, at Company');
  });

  it('a chip inserts its token at the cursor, and the caret lands after it', async () => {
    await open('Hello world');
    body().focus();
    caretAt(body().firstChild!, 5);
    await userEvent.click(screen.getByRole('button', { name: 'Role' }));
    expect(preview()).toHaveTextContent('Hello Role world');
    await waitFor(() => expect(body()).toHaveFocus());
    const sel = window.getSelection()!;
    expect(sel.anchorNode?.textContent).toBe(' world');
    expect(sel.anchorOffset).toBe(0);
  });

  it('a chip says which job field fills it', async () => {
    await open('Hi');
    screen.getByRole('button', { name: 'Company' }).focus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent(/company/i);
  });

  it('Backspace right after a chip removes the whole chip', async () => {
    await open('Hi [Contact], at [Company]');
    const after = screen.getByRole('img', { name: 'Contact variable' }).nextSibling!;
    body().focus();
    caretAt(after, 0);
    await userEvent.keyboard('{Backspace}');
    expect(preview()).toHaveTextContent('Hi , at Company');
    expect(screen.queryByRole('img', { name: 'Contact variable' })).toBeNull();
  });

  it('Delete right before a chip removes the whole chip', async () => {
    await open('Hi [Contact], at [Company]');
    body().focus();
    caretAt(body().firstChild!, 3);
    await userEvent.keyboard('{Delete}');
    expect(preview()).toHaveTextContent('Hi , at Company');
  });

  it('a [Name] typed by hand becomes a chip', async () => {
    await open('Hi [Contact]');
    const last = body().lastChild!;
    body().append(document.createTextNode(' [Pet]'));
    caretAt(last, 0);
    fireEvent.input(body());
    expect(preview()).toHaveTextContent('Hi Contact Pet');
    expect(screen.getByRole('img', { name: 'Pet variable' })).toBeInTheDocument();
  });

  it('Insert variable puts the chip at the cursor', async () => {
    await open('Hi [Contact], at [Company]');
    body().focus();
    caretAt(body().firstChild!, 3);
    await userEvent.click(screen.getByRole('button', { name: 'Insert variable' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Role' }));
    expect(preview()).toHaveTextContent('Hi Role Contact, at Company');
  });

  it('Copy filled text copies the preview', async () => {
    userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText');
    addJob(JOB, 'Fabricator');
    updateJob(JOB, { company: 'Acme Metals' });
    await open('At [Company], [Contact]');
    await userEvent.click(screen.getByRole('combobox', { name: /^Fill for/ }));
    await userEvent.click(await screen.findByRole('option', { name: /Fabricator/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Copy filled text' }));
    expect(writeText.mock.calls[0][0]).toBe('At Acme Metals, [Contact]');
  });
});

// rev-3 M (slice 3): each row expands in place, one at a time, with Copy, Open and a menu.
describe('expandable rows', () => {
  it('a row opens with its first lines and variables as chips; one row is open at a time', async () => {
    createDocument({ kind: 'outreach', title: 'Alpha', base: true, text: 'Hi [Contact], hello' });
    createDocument({ kind: 'outreach', title: 'Bravo', base: true, text: 'Second' });
    renderLib();
    const alpha = screen.getByRole('button', { name: /Alpha/ });
    await userEvent.click(alpha);
    expect(alpha).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Open Alpha' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Bravo/ }));
    expect(alpha).toHaveAttribute('aria-expanded', 'false');
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Open Alpha' })).toBeNull());
  });

  it('lists Outreach messages before Notes (rev-3 M mock order)', () => {
    renderLib();
    const heads = screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'));
    expect(heads.indexOf('Outreach messages')).toBeLessThan(heads.indexOf('Notes'));
  });

  it('a row shows three variable chips in a fixed order and +N, no brackets, kept when open', async () => {
    const id = createDocument({
      kind: 'outreach',
      title: 'Many',
      base: true,
      text: 'Hi [Contact], [Role] at [Company]. [Angle] from [Your name]',
    });
    setDocumentPinned(id, true);
    renderLib();
    const row = screen.getByRole('listitem', { name: 'Many' });
    const chips = () => [...row.querySelectorAll('.rjb-chip')].map((c) => c.textContent);
    expect(chips()).toEqual(['Company', 'Role', 'Contact', '+2']);
    expect(row).not.toHaveTextContent('[');
    expect(row).not.toHaveTextContent('…');
    // Pinned is a badge on the row's top line, above the title.
    const trigger = within(row).getByRole('button', { name: /Many/ });
    expect(trigger.textContent?.indexOf('Pinned')).toBeLessThan(
      trigger.textContent!.indexOf('Many'),
    );
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    // The meta chips stay on the trigger while it is open.
    expect(trigger.querySelectorAll('.rjb-chip')).toHaveLength(4);
  });

  it('a document without variables shows its versions and last edit in the meta line', () => {
    createDocument({ kind: 'cover', title: 'Plain', base: true, text: 'Dear team' });
    renderLib();
    const row = screen.getByRole('listitem', { name: 'Plain' });
    expect(row).toHaveTextContent(/1 version · edited today/);
  });

  it('an open row keeps the text’s line breaks', async () => {
    createDocument({ kind: 'note', title: 'Lines', base: true, text: 'One\nTwo' });
    renderLib();
    await userEvent.click(screen.getByRole('button', { name: /Lines/ }));
    const prev = screen.getByRole('listitem', { name: 'Lines' }).querySelector('.rjb-doc-preview');
    expect(prev).not.toBeNull();
    expect(prev!.textContent).toBe('One\nTwo');
  });

  it('the row menu duplicates and deletes (after asking)', async () => {
    createDocument({ kind: 'note', title: 'Story', base: true, text: 'Once' });
    renderLib();
    await userEvent.click(screen.getByRole('button', { name: /Story/ }));
    await userEvent.click(screen.getByRole('button', { name: 'More actions for Story' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Duplicate' }));
    expect(getAllDocuments().map((d) => d.title)).toEqual(['Story', 'Story (copy)']);
    await userEvent.click(screen.getByRole('button', { name: 'More actions for Story' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    const confirm = within(await screen.findByRole('alertdialog')).getByRole('button', {
      name: 'Delete',
    });
    expect(confirm).toHaveAttribute('data-variant', 'secondary');
    await userEvent.click(confirm);
    expect(getAllDocuments().map((d) => d.title)).toEqual(['Story (copy)']);
  });
});
