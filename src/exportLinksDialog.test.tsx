// Export links (2026-10-22): the saved jobs' posting links as a list to copy or download. Opened
// from the Account menu only (#416: off the Jobs page), on "All saved jobs"; "This view" is the
// Jobs list as filtered and searched.
// Tested at the route seam through App, driven by role + name.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@hirobius/design-system';
import { axe } from 'vitest-axe';

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
import { BRAND } from './brand';
import { linksFilename } from './exportLinks';
import { getAllJobs, removeJob, replaceAll } from './store';
import type { Job } from './types';

const ACME = 'https://acme.example/jobs/1';
const ZENITH = 'https://zenith.example/jobs/2';
const job = (url: string, label: string, company: string, status = 'Saved'): Job =>
  ({ url, label, company, status, added: '2026-10-01' }) as Job;

const renderApp = () =>
  render(
    <ColorModeProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ColorModeProvider>,
  );

function viewport(width: number) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => {
    const min = /min-width:\s*(\d+)px/.exec(query);
    return {
      matches: min ? width >= Number(min[1]) : false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    };
  });
}

let downloads: { name: string; blob: Blob }[] = [];

beforeEach(() => {
  h.fake?.reset();
  localStorage.clear();
  window.history.replaceState(null, '', '/');
  window.location.hash = '#/apply';
  // Zenith is Applied, so the default Active view shows Acme only.
  replaceAll([job(ACME, 'Welder', 'Acme'), job(ZENITH, 'Fitter', 'Zenith', 'Applied')]);
  downloads = [];
  let pending: Blob;
  URL.createObjectURL = vi.fn((b: Blob | MediaSource) => {
    pending = b as Blob;
    return 'blob:test';
  });
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    if (this.download) downloads.push({ name: this.download, blob: pending });
  });
  viewport(1440);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  getAllJobs()
    .slice()
    .forEach((j) => removeJob(j.url));
  // @ts-expect-error -- jsdom has no matchMedia; tests that need one install it
  delete window.matchMedia;
});

const preview = () => screen.getByRole('textbox', { name: 'Preview' }) as HTMLTextAreaElement;

/** Open it from the Account menu and pick This view, the Jobs list as it stands. */
async function openOnThisView(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /^Account/ }));
  const menu = await screen.findByRole('menu');
  await user.click(within(menu).getByRole('menuitem', { name: 'Export links' }));
  const dialog = await screen.findByRole('dialog', { name: 'Export links' });
  await user.click(within(dialog).getByRole('radio', { name: /^This view/ }));
  return dialog;
}

describe('Export links', () => {
  it('This view is the Jobs list: links only, in the view order', async () => {
    const user = userEvent.setup();
    renderApp();
    const dialog = await openOnThisView(user);
    const scope = within(dialog).getByRole('radiogroup', { name: 'Jobs' });
    expect(within(scope).getByRole('radio', { name: 'This view (1)' })).toBeChecked();
    expect(within(scope).getByRole('radio', { name: 'All saved jobs (2)' })).not.toBeChecked();
    expect(preview().value).toBe(ACME);
    expect(preview()).toHaveAttribute('readonly');
    expect(within(dialog).getByText('1 link')).toBeInTheDocument();
  });

  it('switches scope and format', async () => {
    const user = userEvent.setup();
    renderApp();
    const dialog = await openOnThisView(user);
    await user.click(within(dialog).getByRole('radio', { name: 'All saved jobs (2)' }));
    expect(preview().value).toBe(`${ACME}\n${ZENITH}`);
    await user.click(within(dialog).getByRole('radio', { name: 'With title and company' }));
    expect(preview().value).toBe(`Welder — Acme\n${ACME}\n\nFitter — Zenith\n${ZENITH}`);
    expect(within(dialog).getByText('2 links')).toBeInTheDocument();
  });

  it('follows the Jobs panel search', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('button', { name: /^All jobs \d/ }));
    // At 1440 the list is the column beside the first job (#471): its search is the same view.
    await user.type(screen.getByRole('textbox', { name: /^Search (saved )?jobs$/ }), 'zenith');
    const dialog = await openOnThisView(user);
    expect(within(dialog).getByRole('radio', { name: 'This view (1)' })).toBeChecked();
    expect(preview().value).toBe(ZENITH);
  });

  it('skips jobs without a web link and says how many', async () => {
    replaceAll([job(ACME, 'Welder', 'Acme'), job('notes:fabricator', 'Fabricator', 'Bolt')]);
    const user = userEvent.setup();
    renderApp();
    const dialog = await openOnThisView(user);
    await user.click(within(dialog).getByRole('radio', { name: /^All saved jobs/ }));
    expect(
      within(dialog).getByText("1 link. 1 job has no link, so it's left out."),
    ).toBeInTheDocument();
  });

  it('copies the list and says how many links', async () => {
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    const user = userEvent.setup();
    renderApp();
    const dialog = await openOnThisView(user);
    await user.click(within(dialog).getByRole('radio', { name: 'All saved jobs (2)' }));
    await user.click(within(dialog).getByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenCalledWith(`${ACME}\n${ZENITH}`);
    expect(await screen.findByText('Copied 2 links')).toBeInTheDocument();
  });

  it('selects the text to copy by hand when the browser blocks the clipboard', async () => {
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('blocked'));
    const user = userEvent.setup();
    renderApp();
    const dialog = await openOnThisView(user);
    await user.click(within(dialog).getByRole('button', { name: 'Copy' }));
    await waitFor(() => expect(preview()).toHaveFocus());
    expect(preview().selectionStart).toBe(0);
    expect(preview().selectionEnd).toBe(ACME.length);
    expect(await screen.findByText(/copy it by hand/i)).toBeInTheDocument();
  });

  it('downloads a .txt named after the brand and the date', async () => {
    const user = userEvent.setup();
    renderApp();
    const dialog = await openOnThisView(user);
    await user.click(within(dialog).getByRole('radio', { name: 'With title and company' }));
    await user.click(within(dialog).getByRole('button', { name: 'Download .txt' }));
    expect(downloads).toHaveLength(1);
    expect(downloads[0].name).toBe(linksFilename(new Date()));
    expect(downloads[0].name).toMatch(
      new RegExp(`^${BRAND.slug}-links-\\d{4}-\\d\\d-\\d\\d\\.txt$`),
    );
    expect(await downloads[0].blob.text()).toBe(`Welder — Acme\n${ACME}`);
  });

  it('opens from the Account menu on all saved jobs', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('button', { name: /^Account/ }));
    const menu = await screen.findByRole('menu');
    await user.click(within(menu).getByRole('menuitem', { name: 'Export links' }));
    const dialog = await screen.findByRole('dialog', { name: 'Export links' });
    expect(within(dialog).getByRole('radio', { name: 'All saved jobs (2)' })).toBeChecked();
    const results = await axe(dialog, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    });
    expect(results.violations.map((v) => `${v.id} ×${v.nodes.length}`)).toEqual([]);
  });

  it('has nothing to copy or download with no links', async () => {
    replaceAll([job('notes:fabricator', 'Fabricator', 'Bolt')]);
    const user = userEvent.setup();
    renderApp();
    const dialog = await openOnThisView(user);
    expect(within(dialog).getByRole('button', { name: 'Copy' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Download .txt' })).toBeDisabled();
  });
});
