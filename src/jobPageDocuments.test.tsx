// The job page's Documents tab (#228), tested at the route seam through App: #/queue/<jobId>.
// Documents by kind with their Version history, a Base document's independent copy, Mark as
// Sent (locked, one per kind per Job, refusals said plainly) and the Sent line on the header.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { Button, ToastProvider } from '@hirobius/design-system';

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
import { viewport } from './test/viewport';
import { ColorModeProvider } from './ColorMode';
import App from './App';
import JobDocuments from './JobDocuments';
import { addJob, getAllJobs, jobIdOf, removeJob, updateJob } from './store';
import { replaceTrash } from './trash';
import { dismissNotice } from './saveNotice';
import { createDocument, getAllDocuments, markSent, replaceDocuments } from './documents';

const URL_A = 'https://acme.example/jobs/7';

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

const sectionTabs = () => screen.getByRole('tablist', { name: 'Job sections' });
const tab = (name: string | RegExp) => within(sectionTabs()).getByRole('tab', { name });
const openDocuments = async () => {
  const t = tab(/^Documents/);
  await userEvent.click(t);
  return document.getElementById(t.getAttribute('aria-controls')!) as HTMLElement;
};
const docsOf = () => getAllDocuments().filter((d) => d.jobUrl === URL_A);

beforeEach(() => {
  // Radix Select measures and scrolls; jsdom has neither.
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
  window.history.replaceState(null, '', '/');
  window.location.hash = '';
  replaceDocuments([]);
  addJob(URL_A, 'Design Engineer');
  updateJob(URL_A, { company: 'Acme' });
});
afterEach(() => {
  cleanup();
  delete (window as { matchMedia?: unknown }).matchMedia;
  getAllJobs()
    .slice()
    .forEach((j) => removeJob(j.url));
  replaceTrash([]);
  replaceDocuments([]);
  dismissNotice();
});

describe('Documents tab (#228)', () => {
  it('is a job section, with a count once the job has documents', () => {
    openJobPage();
    expect(tab('Documents')).toBeInTheDocument();
    cleanup();
    createDocument({ kind: 'cover', title: 'Cover letter', jobUrl: URL_A, text: 'Hi' });
    openJobPage();
    expect(tab('Documents (1)')).toBeInTheDocument();
  });

  it('starts empty with one action, which makes a document for this job and company', async () => {
    openJobPage();
    const panel = await openDocuments();
    expect(within(panel).getByText('No documents yet')).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole('button', { name: 'New document' }));
    await userEvent.click(screen.getByRole('combobox', { name: /^Kind/ }));
    await userEvent.click(await screen.findByRole('option', { name: 'Cover letter' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Title' }), 'Acme letter');
    await userEvent.type(screen.getByRole('textbox', { name: 'Text' }), 'Dear Acme');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    const [d] = docsOf();
    expect(d).toMatchObject({ kind: 'cover', title: 'Acme letter', company: 'Acme' });
    expect(d.versions.map((v) => v.text)).toEqual(['Dear Acme']);
    expect(screen.getByRole('heading', { name: 'Cover letter' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Acme letter' })).toBeInTheDocument();
    expect(tab('Documents (1)')).toBeInTheDocument();
  });

  it('lists documents by kind, and each save adds a Version to the history', async () => {
    createDocument({ kind: 'cover', title: 'Letter', jobUrl: URL_A, text: 'one' });
    createDocument({ kind: 'resume', title: 'CV', jobUrl: URL_A, text: 'cv' });
    openJobPage();
    const panel = await openDocuments();
    const heads = within(panel)
      .getAllByRole('heading', { level: 3 })
      .map((x) => x.textContent);
    expect(heads).toEqual(['Résumé', 'Cover letter']);
    const letter = screen.getByRole('region', { name: 'Letter' });
    const text = within(letter).getByRole('textbox', { name: 'Text' });
    expect(within(letter).getByRole('button', { name: 'Save version' })).toBeDisabled();
    await userEvent.clear(text);
    await userEvent.type(text, 'two');
    await userEvent.click(within(letter).getByRole('button', { name: 'Save version' }));
    expect(
      docsOf()
        .find((d) => d.title === 'Letter')!
        .versions.map((v) => v.text),
    ).toEqual(['one', 'two']);
    await userEvent.click(within(letter).getByRole('button', { name: /Versions \(2\)/ }));
    expect(within(letter).getByText(/^Version 1/)).toBeInTheDocument();
    expect(within(letter).getByText(/^Version 2/)).toBeInTheDocument();
  });

  it('Use a Base document makes an independent copy: editing either never changes the other', async () => {
    const baseId = createDocument({ kind: 'resume', title: 'Main CV', base: true, text: 'base' });
    openJobPage();
    const panel = await openDocuments();
    await userEvent.click(within(panel).getByRole('button', { name: 'Use a Base document' }));
    await userEvent.click(screen.getByRole('combobox', { name: /^Base document/ }));
    await userEvent.click(await screen.findByRole('option', { name: /Main CV/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Copy into this job' }));
    const [copy] = docsOf();
    expect(copy).toMatchObject({ kind: 'resume', title: 'Main CV', company: 'Acme' });
    expect(copy.base).toBeUndefined();
    expect(copy.id).not.toBe(baseId);
    const region = screen.getByRole('region', { name: 'Main CV' });
    const text = within(region).getByRole('textbox', { name: 'Text' });
    await userEvent.clear(text);
    await userEvent.type(text, 'tailored');
    await userEvent.click(within(region).getByRole('button', { name: 'Save version' }));
    const base = getAllDocuments().find((d) => d.id === baseId)!;
    expect(base.versions.map((v) => v.text)).toEqual(['base']);
    expect(docsOf()[0].versions.map((v) => v.text)).toEqual(['base', 'tailored']);
  });

  it('Mark as Sent asks first, then locks that Version, labels it and shows it on the header', async () => {
    const id = createDocument({ kind: 'cover', title: 'Letter', jobUrl: URL_A, text: 'one' });
    createDocument({ kind: 'cover', title: 'Other letter', jobUrl: URL_A, text: 'alt' });
    openJobPage();
    await openDocuments();
    const letter = screen.getByRole('region', { name: 'Letter' });
    await userEvent.click(within(letter).getByRole('button', { name: /Versions \(1\)/ }));
    await userEvent.click(within(letter).getByRole('button', { name: 'Mark as Sent' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(/can't be un-sent/);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Mark as Sent' }));
    expect(getAllDocuments().find((d) => d.id === id)!.versions[0].sentAt).toBeTruthy();
    expect(within(letter).getAllByText('Sent').length).toBeGreaterThan(0);
    // One per kind per Job: the other cover letter can't be marked, and says why.
    const other = screen.getByRole('region', { name: 'Other letter' });
    await userEvent.click(within(other).getByRole('button', { name: /Versions \(1\)/ }));
    expect(within(other).queryByRole('button', { name: 'Mark as Sent' })).toBeNull();
    expect(within(other).getByText(/already has a Sent Cover letter/)).toBeInTheDocument();
    // A document holding a Sent Version can't be deleted.
    expect(within(letter).queryByRole('button', { name: 'Delete' })).toBeNull();
    const header = screen.getByRole('heading', { level: 2 }).closest('header') as HTMLElement;
    expect(within(header).getByText('Sent: Cover letter v1')).toBeInTheDocument();
  });

  it('a refused Mark as Sent (another device got there first) says so plainly', async () => {
    createDocument({ kind: 'cover', title: 'Letter', jobUrl: URL_A, text: 'one' });
    const otherId = createDocument({ kind: 'cover', title: 'Other', jobUrl: URL_A, text: 'x' });
    openJobPage();
    await openDocuments();
    const letter = screen.getByRole('region', { name: 'Letter' });
    await userEvent.click(within(letter).getByRole('button', { name: /Versions \(1\)/ }));
    await userEvent.click(within(letter).getByRole('button', { name: 'Mark as Sent' }));
    const dialog = await screen.findByRole('alertdialog');
    const other = getAllDocuments().find((d) => d.id === otherId)!;
    act(() => {
      markSent(otherId, other.versions[0].id);
    });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Mark as Sent' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This job already has a Sent Cover letter. Only one can be sent per job.',
    );
  });

  it('a document without a Sent Version can be deleted', async () => {
    createDocument({ kind: 'note', title: 'Scratch', jobUrl: URL_A, text: 'x' });
    openJobPage();
    await openDocuments();
    const region = screen.getByRole('region', { name: 'Scratch' });
    await userEvent.click(within(region).getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(docsOf()).toEqual([]);
    expect(screen.getByText('No documents yet')).toBeInTheDocument();
  });

  it('has no WCAG A/AA violations on a phone (390px) with documents', async () => {
    createDocument({ kind: 'cover', title: 'Letter', jobUrl: URL_A, text: 'one' });
    viewport(390);
    const { container } = openJobPage();
    await openDocuments();
    const r = await axe(container, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    });
    expect(r.violations.map((v) => `${v.id} x${v.nodes.length}`)).toEqual([]);
  });
});

describe('JobDocuments slots for the integrator', () => {
  it('renders a per-Version slot and an upload slot', async () => {
    createDocument({ kind: 'cover', title: 'Letter', jobUrl: URL_A, text: 'one' });
    const job = getAllJobs().find((j) => j.url === URL_A)!;
    render(
      <JobDocuments
        job={job}
        versionActions={(doc, v) => (
          <Button size="sm">{`Download ${doc.title} ${v.id.length > 0}`}</Button>
        )}
        uploadSlot={<Button size="sm">Upload a final copy</Button>}
      />,
    );
    expect(screen.getByRole('button', { name: 'Upload a final copy' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Versions \(1\)/ }));
    expect(screen.getByRole('button', { name: 'Download Letter true' })).toBeInTheDocument();
  });
});
