// The Documents library on its route (#227): `#/copy-deck` is the library (no tab selected, a
// Documents heading and a way back to the Pipeline), `#/copy-deck/<id>` opens one document, an old
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
import { getAllDocuments, replaceDocuments } from './documents';
import { openFollowUp } from './followUpFlow';

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
const outreach = () => screen.getByRole('region', { name: 'Outreach messages' });
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
  it('is a page with no tab selected: a Documents heading and a way back', async () => {
    await renderApp();
    expect(screen.queryByRole('tab', { selected: true })).toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'Documents' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Pipeline' })).toHaveAttribute(
      'href',
      '#/queue',
    );
  });

  it('the Menu opens Documents', async () => {
    window.location.hash = '#/queue';
    await renderApp();
    await userEvent.click(screen.getByRole('button', { name: /^Account/ }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).queryByRole('menuitem', { name: 'Templates' })).toBeNull();
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Documents' }));
    expect(window.location.hash).toBe('#/copy-deck');
    expect(await screen.findByRole('heading', { level: 2, name: 'Documents' })).toBeInTheDocument();
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
    await waitFor(() => expect(window.location.hash).toBe('#/copy-deck/snippet-tpl-thanks'));
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('Thank-you after interview');
    await userEvent.click(screen.getByRole('button', { name: 'All documents' }));
    await waitFor(() => expect(window.location.hash).toBe('#/copy-deck'));
  });

  it('an old template link opens the message its snippet became', async () => {
    window.location.hash = '#/copy-deck/tpl-cover';
    await renderApp();
    expect(await screen.findByRole('textbox', { name: 'Title' })).toHaveValue('Cover letter');
    await waitFor(() => expect(window.location.hash).toBe('#/copy-deck/snippet-tpl-cover'));
  });

  it('an unknown id falls back to the library', async () => {
    window.location.hash = '#/copy-deck/nope';
    await renderApp();
    await waitFor(() => expect(window.location.hash).toBe('#/copy-deck'));
    expect(screen.getByRole('region', { name: 'Outreach messages' })).toBeInTheDocument();
  });

  it('a deleted starter stays deleted; Restore brings it back under its own kind', async () => {
    window.location.hash = '#/copy-deck/snippet-tpl-cover';
    const r = await renderApp();
    await screen.findByRole('textbox', { name: 'Title' });
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    await userEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }),
    );
    await waitFor(() => expect(window.location.hash).toBe('#/copy-deck'));
    expect(ids()).not.toContain('snippet-tpl-cover');
    // A reload runs the startup move again: the snippet was moved once, so nothing comes back.
    r.unmount();
    await renderApp();
    await screen.findByRole('region', { name: 'Outreach messages' });
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
    window.location.hash = '#/queue';
    await renderApp();
    openFollowUp(JOB);
    const dialog = await screen.findByRole('dialog');
    expect(
      (within(dialog).getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement).value,
    ).toContain('P.S. Acme Metals rocks.');
  });

  it('Use template on the job page', async () => {
    await editFollowUp();
    window.location.hash = `#/queue/${jobIdOf(JOB)}`;
    await renderApp();
    await userEvent.click(await screen.findByRole('button', { name: 'Use template' }));
    await userEvent.click(screen.getByRole('button', { name: 'Follow-up after applying' }));
    expect((screen.getByLabelText('Preview') as HTMLTextAreaElement).value).toContain(
      'P.S. Acme Metals rocks.',
    );
  });

  it('the Apply sheet, with a link to edit them in Documents', async () => {
    await editFollowUp();
    window.location.hash = `#/apply/${jobIdOf(JOB)}`;
    await renderApp();
    const list = await screen.findByRole('list', { name: 'Your templates' });
    await userEvent.click(
      within(list).getByRole('button', { name: 'Show all of Follow-up after applying' }),
    );
    expect(within(list).getByText(/P\.S\. Acme Metals rocks\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit documents' })).toHaveAttribute(
      'href',
      '#/copy-deck',
    );
  });
});

describe('the Company page (#230)', () => {
  beforeEach(() => {
    addJob(JOB, 'Fabricator');
    updateJob(JOB, { company: 'Acme Metals' });
  });

  it('#/company/<slug> shows the company under the Pipeline tab', async () => {
    window.location.hash = '#/company/acme-metals';
    await renderApp();
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Acme Metals' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { selected: true })).toHaveAccessibleName('Pipeline');
    expect(screen.getByRole('link', { name: 'Fabricator' })).toHaveAttribute(
      'href',
      `#/queue/${jobIdOf(JOB)}`,
    );
  });

  it("a job's company links to its page; a job with no company has no link", async () => {
    window.location.hash = `#/queue/${jobIdOf(JOB)}`;
    await renderApp();
    const link = await screen.findByRole('link', { name: 'Acme Metals' });
    expect(link).toHaveAttribute('href', '#/company/acme-metals');
    await userEvent.click(link);
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Acme Metals' }),
    ).toBeInTheDocument();
  });
});
