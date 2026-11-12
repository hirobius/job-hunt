// The Documents library on its route (#227): `#/copy-deck` is the library (no tab selected, a
// Documents dialog over the page, #471 slice 4), `#/copy-deck/<id>` opens one document, an old
// `#/copy-deck/<snippetId>` link opens the message that snippet became, and an unknown id returns to
// the library. Snippets move into the library once at startup; a deleted message stays deleted and
// the starter set can be restored. Editing a message there changes what the fill paths use.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
import { addJob, getAllJobs, jobIdOf, removeJob, setStatus, updateJob } from './store';
import { replaceCurationState } from './curation/curationStore';
import { seedPack } from './curation/starterPacks';
import { replaceSnippets, restoreStarterSnippets } from './copyDeckStore';
import { addFinalCopy, createDocument, getAllDocuments, replaceDocuments } from './documents';
import { openFollowUp } from './followUpFlow';
import { currentTab } from './test/topTabs';

const JOB = 'https://acme.example/jobs/1';

const renderApp = async () => {
  const r = render(
    <ColorModeProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ColorModeProvider>,
  );
  await waitFor(() => expect(screen.queryByLabelText('Loading')).toBeNull());
  return r;
};
const outreach = () => screen.getByRole('region', { name: 'Messages' });
const covers = () => screen.getByRole('region', { name: 'Cover letters' });
const ids = () => getAllDocuments().map((d) => d.id);

beforeEach(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  h.fake?.reset();
  localStorage.clear();
  seedPack('consulting'); // a track, so Companies isn't the first-run gate
  replaceDocuments([]);
  replaceSnippets([]);
  restoreStarterSnippets(); // a device that has never moved its snippets
  window.history.replaceState(null, '', '/');
  window.location.hash = '#/copy-deck';
});
afterEach(() => {
  cleanup();
  getAllJobs()
    .slice()
    .forEach((j) => removeJob(j.url));
  replaceCurationState({ categories: [], groups: [], tiles: [] });
});

describe('the Documents page', () => {
  it('an old #/copy-deck link opens the Documents dialog over Find; Close leaves Find as it was', async () => {
    await renderApp();
    await waitFor(() => expect(window.location.hash).toBe('#/find?documents='));
    const dialog = await screen.findByRole('dialog', { name: 'Documents' });
    expect(currentTab('Find', { hidden: true })).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: /Close/ }));
    await waitFor(() => expect(window.location.hash).toBe('#/find'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('with no documents, no subtitle repeats the empty state; with some, it says what goes here', async () => {
    replaceSnippets([]);
    await renderApp();
    // Found by its content: the dialog it is in is the loaded one, not a hold before it.
    expect(await screen.findByText('No documents yet')).toBeInTheDocument();
    const dialog = screen.getByRole('dialog', { name: 'Documents' });
    const subtitle = /^Résumés, cover letters, outreach messages and notes\.$/;
    expect(within(dialog).queryByText(subtitle)).toBeNull();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add starter messages' }));
    expect(await within(dialog).findByText(subtitle)).toBeInTheDocument();
  });

  it('the Menu opens Documents', async () => {
    window.location.hash = '#/apply';
    await renderApp();
    await userEvent.click(screen.getByRole('button', { name: /^Account/ }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).queryByRole('menuitem', { name: 'Templates' })).toBeNull();
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Documents' }));
    // Over the page it was opened from.
    await waitFor(() => expect(window.location.hash).toBe('#/apply?documents='));
    expect(await screen.findByRole('dialog', { name: 'Documents' })).toBeInTheDocument();
  });

  it('moves the snippets into the library as Outreach messages at startup', async () => {
    await renderApp();
    await waitFor(() =>
      expect(
        within(outreach()).getByRole('button', { name: /Follow-up after applying/ }),
      ).toBeInTheDocument(),
    );
    expect(ids()).toContain('snippet-tpl-cover');
  });

  it('a document opens by its id and All documents goes back', async () => {
    await renderApp();
    await userEvent.click(
      await within(outreach()).findByRole('button', { name: /Thank-you after interview/ }),
    );
    // The row expands first (rev-3 M); Open goes to the editor.
    await userEvent.click(screen.getByRole('button', { name: 'Open Thank-you after interview' }));
    await waitFor(() => expect(window.location.hash).toBe('#/find?documents=snippet-tpl-thanks'));
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('Thank-you after interview');
    await userEvent.click(screen.getByRole('button', { name: 'All documents' }));
    await waitFor(() => expect(window.location.hash).toBe('#/find?documents='));
  });

  it('an old template link opens the message its snippet became', async () => {
    window.location.hash = '#/copy-deck/tpl-cover';
    await renderApp();
    expect(await screen.findByRole('textbox', { name: 'Title' })).toHaveValue('Cover letter');
    await waitFor(() => expect(window.location.hash).toBe('#/find?documents=snippet-tpl-cover'));
  });

  it('an unknown id falls back to the library', async () => {
    window.location.hash = '#/copy-deck/nope';
    await renderApp();
    await waitFor(() => expect(window.location.hash).toBe('#/find?documents='));
    expect(screen.getByRole('region', { name: 'Messages' })).toBeInTheDocument();
  });

  it('a deleted starter stays deleted; Restore brings it back under its own kind', async () => {
    window.location.hash = '#/copy-deck/snippet-tpl-cover';
    const r = await renderApp();
    await screen.findByRole('textbox', { name: 'Title' });
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    await waitFor(() => expect(window.location.hash).toBe('#/find?documents='));
    expect(ids()).not.toContain('snippet-tpl-cover');
    // A reload runs the startup move again: the snippet was moved once, so nothing comes back.
    r.unmount();
    await renderApp();
    await screen.findByRole('region', { name: 'Messages' });
    expect(ids()).not.toContain('snippet-tpl-cover');
    // The starter cover letter is a Cover letter (#260): it is offered back there, not under messages.
    expect(
      within(outreach()).queryByRole('button', { name: 'Restore starter messages' }),
    ).toBeNull();
    await userEvent.click(
      within(covers()).getByRole('button', { name: 'Restore starter cover letter' }),
    );
    expect(getAllDocuments().find((d) => d.id === 'snippet-tpl-cover')?.kind).toBe('cover');
    expect(
      within(covers()).queryByRole('button', { name: 'Restore starter cover letter' }),
    ).toBeNull();
  });
});

// QA: an edit was thrown away without a word on All documents, the browser's Back or a reload.
describe('unsaved edits in the editor', () => {
  const OPEN = '#/copy-deck/snippet-tpl-outreach';
  /** Type a line at the end of the open message (TokenField is contenteditable). */
  const typeInMessage = async (line: string) => {
    const text = await screen.findByRole('textbox', { name: 'Message text' });
    text.append(document.createTextNode(line));
    fireEvent.input(text);
    return text;
  };
  beforeEach(() => sessionStorage.clear());

  it('All documents asks first; Keep editing is the default and keeps the edit', async () => {
    window.location.hash = OPEN;
    await renderApp();
    await typeInMessage(' Unsaved line.');
    await userEvent.click(screen.getByRole('button', { name: 'All documents' }));
    const ask = await screen.findByRole('alertdialog', { name: 'Discard changes?' });
    expect(within(ask).getByRole('button', { name: 'Keep editing' })).toHaveFocus();
    // The ask's way out is the exit (#537); Discard is the danger key.
    expect(within(ask).getByRole('button', { name: 'Keep editing' })).toHaveAttribute(
      'data-variant',
      'link',
    );
    await userEvent.click(within(ask).getByRole('button', { name: 'Keep editing' }));
    expect(window.location.hash).toBe('#/find?documents=snippet-tpl-outreach');
    expect(screen.getByRole('textbox', { name: 'Message text' })).toHaveTextContent(
      'Unsaved line.',
    );
  });

  it('Discard goes back and drops the edit', async () => {
    window.location.hash = OPEN;
    const r = await renderApp();
    await typeInMessage(' Unsaved line.');
    await userEvent.click(screen.getByRole('button', { name: 'All documents' }));
    const ask = await screen.findByRole('alertdialog', { name: 'Discard changes?' });
    await userEvent.click(within(ask).getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(window.location.hash).toBe('#/find?documents='));
    r.unmount();
    window.location.hash = OPEN;
    await renderApp();
    expect(await screen.findByRole('textbox', { name: 'Message text' })).not.toHaveTextContent(
      'Unsaved line.',
    );
  });

  it('with nothing unsaved, All documents goes straight back', async () => {
    window.location.hash = OPEN;
    await renderApp();
    await screen.findByRole('textbox', { name: 'Message text' });
    await userEvent.click(screen.getByRole('button', { name: 'All documents' }));
    await waitFor(() => expect(window.location.hash).toBe('#/find?documents='));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('a reload or a closed tab warns while there is an unsaved edit', async () => {
    window.location.hash = OPEN;
    await renderApp();
    const before = () => {
      const e = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    };
    await screen.findByRole('textbox', { name: 'Message text' });
    expect(before()).toBe(false);
    await typeInMessage(' Unsaved line.');
    expect(before()).toBe(true);
  });

  it("leaving by the browser's Back keeps the edit and brings it back, with a notice", async () => {
    window.location.hash = OPEN;
    const r = await renderApp();
    await typeInMessage(' Unsaved line.');
    // Back: the hash moves on and the editor goes, with no chance to ask.
    window.location.hash = '#/find?documents=';
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Message text' })).toBeNull());
    r.unmount();
    window.location.hash = OPEN;
    await renderApp();
    expect(await screen.findByRole('textbox', { name: 'Message text' })).toHaveTextContent(
      'Unsaved line.',
    );
    // The toast sits behind the modal dialog (toastAnnouncer says it to a screen reader).
    expect(await screen.findByText('Restored unsaved changes')).toBeInTheDocument();
    // Saving makes it the latest Version, and the kept draft goes.
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(
        getAllDocuments()
          .find((d) => d.id === 'snippet-tpl-outreach')!
          .versions.slice(-1)[0].text,
      ).toContain('Unsaved line.'),
    );
    expect(sessionStorage.length).toBe(0);
  });
});

describe('editing a message changes what the fill paths use', () => {
  /** Open the follow-up message in the library, add a line, and save it as a new Version. */
  async function editFollowUp() {
    window.location.hash = '#/copy-deck/tpl-followup';
    const r = await renderApp();
    const text = await screen.findByRole('textbox', { name: 'Message text' });
    text.append(document.createTextNode(' P.S. [Company] rocks.'));
    fireEvent.input(text);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(getAllDocuments().find((d) => d.id === 'snippet-tpl-followup')!.versions).toHaveLength(
        2,
      ),
    );
    r.unmount();
  }

  beforeEach(() => {
    addJob(JOB, 'Fabricator');
    updateJob(JOB, { company: 'Acme Metals' });
  });

  it('the follow-up dialog', async () => {
    await editFollowUp();
    setStatus(JOB, 'Applied');
    window.location.hash = '#/apply';
    await renderApp();
    openFollowUp(JOB);
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('P.S. Acme Metals rocks.');
  });

  it('the job page: Copy follow-up uses it, with a link to edit them in Documents (#540)', async () => {
    await editFollowUp();
    updateJob(JOB, { status: 'Applied', applied: '2026-01-01' });
    window.location.hash = `#/apply/${jobIdOf(JOB)}`;
    await renderApp();
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText');
    await user.click(await screen.findByRole('button', { name: /^Copy follow-up: / }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('P.S. Acme Metals rocks.'));
    // Documents opens as a dialog over this job (#471 slice 4): closing it comes back here.
    expect(screen.getByRole('link', { name: 'Edit documents' })).toHaveAttribute(
      'href',
      `#/apply/${jobIdOf(JOB)}?documents=`,
    );
  });
});

describe('the Company page (#230)', () => {
  beforeEach(() => {
    addJob(JOB, 'Fabricator');
    updateJob(JOB, { company: 'Acme Metals' });
  });

  it('#/apply/company/<slug> shows the company under the Pipeline tab', async () => {
    window.location.hash = '#/apply/company/acme-metals';
    await renderApp();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Acme Metals' }),
    ).toBeInTheDocument();
    expect(currentTab()).toHaveAccessibleName('Apply');
    // The job page remembers the Company page, so its Back returns here (return paths).
    expect(screen.getByRole('link', { name: 'Fabricator' })).toHaveAttribute(
      'href',
      `#/apply/${jobIdOf(JOB)}?from=%2Fapply%2Fcompany%2Facme-metals`,
    );
  });

  it("a job's company links to its page; a job with no company has no link", async () => {
    window.location.hash = `#/apply/${jobIdOf(JOB)}`;
    await renderApp();
    const link = await screen.findByRole('link', { name: 'Acme Metals' });
    expect(link).toHaveAttribute(
      'href',
      `#/apply/company/acme-metals?from=%2Fapply%2F${jobIdOf(JOB)}`,
    );
    await userEvent.click(link);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Acme Metals' }),
    ).toBeInTheDocument();
  });
});

// #328: the library edits Base documents only. A job's own document or an uploaded final copy
// named by a hand-typed or stale link opens its job page (Documents live there), else the library.
describe('a link to a document that is not a Base one', () => {
  const FILE = { name: 'cv.pdf', type: 'application/pdf', size: 3, data: 'YWJj' };

  it("a job's document opens its job page", async () => {
    addJob(JOB, 'Designer');
    const id = createDocument({ kind: 'cover', title: 'Acme letter', text: 'Hi', jobUrl: JOB });
    window.location.hash = `#/copy-deck/${id}`;
    await renderApp();
    await waitFor(() => expect(window.location.hash).toBe(`#/apply/${jobIdOf(JOB)}`));
    expect(screen.queryByRole('button', { name: /^Version history/ })).toBeNull();
  });

  it('a final copy opens its job page, never the editor', async () => {
    addJob(JOB, 'Designer');
    const r = addFinalCopy({ kind: 'resume', jobUrl: JOB, file: FILE });
    if (!r.ok) throw new Error(r.error);
    window.location.hash = `#/copy-deck/${r.id}`;
    await renderApp();
    await waitFor(() => expect(window.location.hash).toBe(`#/apply/${jobIdOf(JOB)}`));
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });

  it("one whose job isn't saved falls back to the library", async () => {
    const id = createDocument({ kind: 'note', title: 'Orphan', text: 'x', jobUrl: JOB });
    window.location.hash = `#/copy-deck/${id}`;
    await renderApp();
    await waitFor(() => expect(window.location.hash).toBe('#/find?documents='));
    expect(screen.queryByRole('textbox', { name: 'Title' })).toBeNull();
  });
});
