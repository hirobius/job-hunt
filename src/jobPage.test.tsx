// The job page (#130), tested at the route seam through App: #/apply/<jobId>. Slice by slice:
// header + Overview, tabs, delete, two-pane desktop.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { openAllJobs } from './test/allJobs';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
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
import { loadSupabase } from './supabase';
import { viewport } from './test/viewport';
import { setPipelineView } from './pipelineView';
import { ColorModeProvider } from './ColorMode';
import App from './App';
import { addJob, findJobById, getAllJobs, jobIdOf, removeJob, updateJob } from './store';
import { replaceTrash } from './trash';
import { dismissNotice } from './saveNotice';
import { ymd } from './jobEvents';
import { currentTab } from './test/topTabs';

const URL_A = 'https://acme.example/jobs/7';
// Applied today: no follow-up is due, so the header's primary comes from the status alone.
const todayYmd = () => ymd(new Date());
const URL_B = 'https://zenith.example/jobs/2';

const renderApp = () =>
  render(
    <ColorModeProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ColorModeProvider>,
  );

const openJobPage = (url = URL_A) => {
  window.location.hash = `#/apply/${jobIdOf(url)}`;
  return renderApp();
};

// The Supabase client loads lazily (supabase.ts); load it as a sign-in would, so `fake()` exists.
beforeEach(async () => {
  await loadSupabase();
  h.fake?.reset();
  localStorage.clear();
  window.history.replaceState(null, '', '/');
  window.location.hash = '';
});
afterEach(() => {
  cleanup();
  // viewport() installs a matchMedia stub; drop it so the next test is narrow again.
  delete (window as { matchMedia?: unknown }).matchMedia;
  getAllJobs()
    .slice()
    .forEach((j) => removeJob(j.url));
  replaceTrash([]);
  dismissNotice();
});

describe('job page header and Overview (#130 slice 1)', () => {
  it('the header has the title, the status, a star toggle, one primary action and a menu', () => {
    addJob(URL_A, 'Design Engineer');
    openJobPage();
    const header = screen
      .getByRole('heading', { level: 1, name: 'Design Engineer' })
      .closest('header') as HTMLElement;
    expect(header).not.toBeNull();
    // #538: no Saved chip; the company and facts line say what is missing.
    expect(within(header).queryByText('Saved')).toBeNull();
    expect(within(header).getByText('Company not stated')).toBeInTheDocument();
    expect(within(header).getByText('Pay not stated')).toBeInTheDocument();
    // No star (#534): every job on Apply is already saved.
    expect(within(header).queryByRole('button', { name: /^Star/ })).toBeNull();
    // The keys sit in the dock (#535), outside the header on a phone.
    expect(screen.getByRole('button', { name: /^Mark applied/ })).toBeInTheDocument();
    expect(within(header).getByRole('button', { name: /^More actions/ })).toBeInTheDocument();
  });

  it('no glyph by the title: the posting is Open application or the menu (Adrian 2026-11-08)', async () => {
    addJob(URL_A, 'Design Engineer');
    updateJob(URL_A, { company: 'Acme' });
    openJobPage();
    const header = screen
      .getByRole('heading', { level: 1, name: 'Design Engineer' })
      .closest('header') as HTMLElement;
    expect(within(header).queryByRole('link', { name: /^Open posting for / })).toBeNull();
    expect(screen.getByRole('link', { name: /Open application/ })).toHaveAttribute('href', URL_A);
    await userEvent.click(
      within(header).getByRole('button', { name: 'More actions: Design Engineer' }),
    );
    expect(
      within(await screen.findByRole('menu')).getByRole('menuitem', { name: 'Open posting' }),
    ).toHaveAttribute('href', URL_A);
  });

  it('a job that is only a URL still opens its posting from the header', () => {
    addJob(URL_A);
    openJobPage();
    // Details opens as fields (no link fact), so the header is the one-tap way out.
    expect(screen.getByRole('textbox', { name: 'Link' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open application/ })).toHaveAttribute('href', URL_A);
  });

  it('the primary action is Follow up when one is due, and Mark applied is gone', () => {
    addJob(URL_A, 'Design Engineer');
    const d = new Date();
    d.setDate(d.getDate() - 10);
    const p = (n: number) => String(n).padStart(2, '0');
    updateJob(URL_A, {
      status: 'Applied',
      applied: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    });
    openJobPage();
    expect(screen.getByRole('button', { name: /^Follow up/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Mark applied/ })).toBeNull();
  });

  it('with no next step there is no dock: More sits by the title, no empty slot (#535)', () => {
    addJob(URL_A, 'Design Engineer');
    updateJob(URL_A, { status: 'Offer', applied: todayYmd() });
    openJobPage();
    expect(screen.getByRole('button', { name: /^More actions/ })).toBeInTheDocument();
    expect(document.querySelector('[data-rjb-actions]')).toBeNull();
    expect(screen.queryByRole('group', { name: /^Actions for / })).toBeNull();
  });

  it('a job to apply to: the dock holds the filled key, the grey key, then the exit (#535)', () => {
    addJob(URL_A, 'Design Engineer');
    openJobPage();
    const dock = screen.getByRole('group', { name: 'Actions for Design Engineer' });
    const keys = [...dock.querySelectorAll('a, button')];
    expect(keys.map((k) => k.getAttribute('data-variant'))).toEqual([
      'primary',
      'secondary',
      'link',
    ]);
    expect(keys.map((k) => k.textContent)).toEqual([
      'Open application',
      'Mark applied',
      'Not a fit',
    ]);
  });

  it('no star anywhere on the job page; a stored star stays in the data (#534)', async () => {
    addJob(URL_A, 'Design Engineer');
    updateJob(URL_A, { priority: true });
    openJobPage();
    expect(screen.queryByRole('button', { name: /^Star/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /^More actions/ }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).queryByRole('menuitem', { name: /Star/ })).toBeNull();
    expect(within(menu).getByRole('menuitem', { name: 'Remove from Apply' })).toBeInTheDocument();
    expect(findJobById(jobIdOf(URL_A), getAllJobs())?.priority).toBe(true);
  });

  it('Overview lists the facts the job has as a definition list', () => {
    addJob(URL_A, 'Design Engineer');
    updateJob(URL_A, { company: 'Acme', location: 'Spokane, WA', salary: '$80k' });
    openJobPage();
    const facts = document.querySelector('dl') as HTMLElement;
    expect(facts).not.toBeNull();
    expect(within(facts).getByText('Company').nextElementSibling).toHaveTextContent('Acme');
    expect(within(facts).getByText('Location').nextElementSibling).toHaveTextContent('Spokane, WA');
    expect(within(facts).getByText('Pay').nextElementSibling).toHaveTextContent('$80k');
    const link = within(facts).getByRole('link', { name: /acme\.example/ });
    expect(link).toHaveAttribute('href', URL_A);
    expect(within(facts).queryByText('Seniority')).toBeNull();
  });

  it('has no Edit details disclosure: Edit turns the facts card into its fields', async () => {
    addJob(URL_A, 'Design Engineer');
    updateJob(URL_A, { company: 'Acme' });
    openJobPage();
    expect(screen.queryByRole('textbox', { name: 'Company' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Edit details' }));
    expect(document.querySelector('dl')).toBeNull();
    for (const name of ['Title', 'Company', 'Location', 'Pay', 'Link', 'Contact'])
      expect(screen.getByRole('textbox', { name })).toBeInTheDocument();
    // Seniority and résumé version wait behind More fields.
    expect(screen.queryByRole('textbox', { name: 'Seniority' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /More fields/ }));
    expect(screen.getByRole('textbox', { name: 'Seniority' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Résumé version' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(document.querySelector('dl')).not.toBeNull();
  });

  it('a job that is only a URL opens with its fields showing', () => {
    addJob(URL_A);
    openJobPage();
    expect(screen.getByRole('textbox', { name: 'Company' })).toBeInTheDocument();
  });

  it('editing a field updates the store and flashes Saved', async () => {
    addJob(URL_A);
    openJobPage();
    await userEvent.type(screen.getByRole('textbox', { name: 'Company' }), 'Acme');
    expect(getAllJobs()[0].company).toBe('Acme');
    expect(screen.getByText('Saved ✓')).toBeInTheDocument();
  });

  it('a new link moves the job and the page follows it', async () => {
    addJob(URL_A);
    openJobPage();
    const link = screen.getByRole('textbox', { name: 'Link' });
    await userEvent.clear(link);
    await userEvent.type(link, 'https://acme.example/jobs/8{Enter}');
    expect(getAllJobs()[0].url).toBe('https://acme.example/jobs/8');
    await waitFor(() =>
      expect(window.location.hash).toBe(`#/apply/${jobIdOf('https://acme.example/jobs/8')}`),
    );
  });

  it('keeps research links in the header menu', async () => {
    addJob(URL_A, 'Design Engineer');
    updateJob(URL_A, { company: 'Acme' });
    openJobPage();
    expect(screen.queryByRole('link', { name: /^Glassdoor/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /^More actions/ }));
    expect(await screen.findByRole('menuitem', { name: /^Glassdoor/ })).toBeInTheDocument();
  });
});

describe('job page Notes (#130 slice 2; one page since #416)', () => {
  it('has Notes, once', async () => {
    addJob(URL_A, 'Design Engineer');
    updateJob(URL_A, { company: 'Acme' });
    openJobPage();
    const notes = screen.getAllByRole('textbox', { name: 'Notes' });
    expect(notes).toHaveLength(1);
    await userEvent.type(notes[0], 'Ask about the shop floor');
    await userEvent.tab();
    expect(getAllJobs()[0].notes).toBe('Ask about the shop floor');
  });

  it('Notes is never lost: saved while typing, and on leaving the page without a blur', async () => {
    addJob(URL_A, 'Design Engineer');
    addJob(URL_B, 'Welder');
    updateJob(URL_A, { company: 'Acme' });
    openJobPage();
    const notes = () => screen.getByRole('textbox', { name: 'Notes' });
    // Debounced save while typing, no blur.
    await userEvent.type(notes(), 'Ask');
    await waitFor(() => expect(findJobById(jobIdOf(URL_A))?.notes).toBe('Ask'));
    // pagehide (reload, phone back gesture) flushes the draft at once.
    await userEvent.type(notes(), ' about pay');
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(findJobById(jobIdOf(URL_A))?.notes).toBe('Ask about pay');
    // A hash change (browser Back) unmounts the field: the draft is flushed on unmount.
    await userEvent.type(notes(), ' and hours');
    act(() => {
      window.location.hash = '#/find';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Notes' })).toBeNull());
    expect(findJobById(jobIdOf(URL_A))?.notes).toBe('Ask about pay and hours');
  });

  it('Notes follows a note synced from another device, then keeps typing on it (#330)', async () => {
    addJob(URL_A, 'Design Engineer');
    updateJob(URL_A, { notes: 'Old note' });
    openJobPage();
    const notes = () => screen.getByRole('textbox', { name: 'Notes' });
    expect(notes()).toHaveValue('Old note');
    // A sync pull brings a newer note while the page is open and nothing is being typed.
    act(() => updateJob(URL_A, { notes: 'Synced from the laptop' }));
    expect(notes()).toHaveValue('Synced from the laptop');
    await userEvent.type(notes(), '!');
    await userEvent.tab();
    expect(findJobById(jobIdOf(URL_A))?.notes).toBe('Synced from the laptop!');
  });

  it('clearing Notes never brings the older note back into the field (#330 review)', async () => {
    addJob(URL_A, 'Design Engineer', 'Found in Live postings');
    updateJob(URL_A, { notes: 'Ask about pay' });
    openJobPage();
    const notes = screen.getByRole('textbox', { name: 'Notes' });
    await userEvent.clear(notes);
    await userEvent.tab();
    expect(findJobById(jobIdOf(URL_A))?.notes).toBe('');
    expect(notes).toHaveValue('');
  });

  it('an unsaved Notes edit wins over a note synced meanwhile (#330)', async () => {
    addJob(URL_A, 'Design Engineer');
    updateJob(URL_A, { notes: 'Old' });
    openJobPage();
    const notes = () => screen.getByRole('textbox', { name: 'Notes' });
    await userEvent.type(notes(), ' typed here');
    act(() => updateJob(URL_A, { notes: 'Synced' }));
    expect(notes()).toHaveValue('Old typed here');
    await userEvent.tab();
    expect(findJobById(jobIdOf(URL_A))?.notes).toBe('Old typed here');
  });

  it('never hides either note: Notes edits notes, with the older note read-only above', () => {
    addJob(URL_A, 'Design Engineer', 'Found in Live postings · Remotive');
    updateJob(URL_A, { company: 'Acme', notes: 'Ask about the shop floor' });
    openJobPage();
    expect(screen.getByRole('textbox', { name: 'Notes' })).toHaveValue('Ask about the shop floor');
    expect(screen.getByText(/From when you saved it: Found in Live postings/)).toBeInTheDocument();
  });

  it('with only the older note, the Notes field shows it and no duplicate line', () => {
    addJob(URL_A, 'Design Engineer', 'Recruiter screen');
    updateJob(URL_A, { company: 'Acme' });
    openJobPage();
    expect(screen.getByRole('textbox', { name: 'Notes' })).toHaveValue('Recruiter screen');
    expect(screen.queryByText(/From when you saved it/)).toBeNull();
  });
});

/** Recently removed is an Account menu item (#416: off the Jobs page). */
const openRecentlyRemoved = async (n: number) => {
  await userEvent.click(screen.getByRole('button', { name: /^Account/ }));
  await userEvent.click(await screen.findByRole('menuitem', { name: `Recently removed (${n})` }));
};

describe('job page remove (Recently removed)', () => {
  it('Remove is in the header menu; Overview has no delete section', async () => {
    addJob(URL_A, 'Design Engineer');
    openJobPage();
    expect(screen.queryByRole('button', { name: /Remove this job/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /^More actions/ }));
    expect(screen.getByRole('menuitem', { name: 'Remove from Apply' })).toBeInTheDocument();
  });

  it('removes without asking, returns to the list, and Undo brings it back whole', async () => {
    addJob(URL_A, 'Design Engineer');
    updateJob(URL_A, { notes: 'Ask about the shop floor' });
    openJobPage();
    await userEvent.click(screen.getByRole('button', { name: /^More actions/ }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Remove from Apply' }));
    expect(getAllJobs()).toHaveLength(0);
    await waitFor(() => expect(window.location.hash).toBe('#/apply'));
    expect(screen.getByText('Removed from Apply: Design Engineer')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(getAllJobs().map((j) => j.notes)).toEqual(['Ask about the shop floor']);
    expect(screen.queryByText('Removed from Apply: Design Engineer')).toBeNull();
  });

  it('Recently removed (in the Account menu) restores or deletes for good', async () => {
    addJob(URL_A, 'Design Engineer');
    addJob(URL_B, 'Welder');
    window.location.hash = '#/apply';
    renderApp();
    expect(screen.queryByRole('button', { name: /Recently removed/ })).toBeNull();
    await openAllJobs();
    for (const name of ['Design Engineer', 'Welder']) {
      await userEvent.click(screen.getByRole('button', { name: `More actions: ${name}` }));
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Remove from Apply' }));
    }
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'All jobs' })).toBeNull());
    await openRecentlyRemoved(2);
    const dialog = await screen.findByRole('dialog', { name: 'Recently removed' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Restore: Welder' }));
    expect(getAllJobs().map((j) => j.label)).toEqual(['Welder']);
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Delete forever: Design Engineer' }),
    );
    expect(getAllJobs().map((j) => j.label)).toEqual(['Welder']);
    expect(screen.queryByRole('dialog', { name: 'Recently removed' })).toBeNull();
  });

  it('Delete forever offers Undo inside the dialog, and Undo puts the job back in the list', async () => {
    addJob(URL_A, 'Design Engineer');
    addJob(URL_B, 'Welder');
    updateJob(URL_A, { notes: 'Ask about the shop floor' });
    window.location.hash = '#/apply';
    renderApp();
    await openAllJobs();
    for (const name of ['Design Engineer', 'Welder']) {
      await userEvent.click(screen.getByRole('button', { name: `More actions: ${name}` }));
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Remove from Apply' }));
    }
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'All jobs' })).toBeNull());
    await openRecentlyRemoved(2);
    const dialog = await screen.findByRole('dialog', { name: 'Recently removed' });
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Delete forever: Design Engineer' }),
    );
    await waitFor(() =>
      expect(within(dialog).queryByRole('button', { name: 'Restore: Design Engineer' })).toBeNull(),
    );
    const status = within(dialog).getByRole('status');
    expect(status).toHaveTextContent('Deleted “Design Engineer” for good');
    await userEvent.click(within(status).getByRole('button', { name: 'Undo' }));
    await userEvent.click(
      await within(dialog).findByRole('button', { name: 'Restore: Design Engineer' }),
    );
    expect(getAllJobs().map((j) => j.notes)).toContain('Ask about the shop floor');
  });

  it('deleting the last one closes the dialog and its Undo moves to the toast', async () => {
    addJob(URL_A, 'Design Engineer');
    window.location.hash = '#/apply';
    renderApp();
    await userEvent.click(screen.getByRole('button', { name: 'More actions: Design Engineer' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Remove from Apply' }));
    await openRecentlyRemoved(1);
    const dialog = await screen.findByRole('dialog', { name: 'Recently removed' });
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Delete forever: Design Engineer' }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    await userEvent.click(screen.getByRole('button', { name: /^Account/ }));
    expect(
      await screen.findByRole('menuitem', { name: 'Recently removed (1)' }),
    ).toBeInTheDocument();
  });

  it('a removed job still opens its posting from Recently removed (Adrian 2026-10-22)', async () => {
    addJob(URL_B, 'Welder');
    replaceTrash([
      {
        job: { url: URL_A, label: 'Design Engineer', company: 'Acme', status: 'Saved' },
        removedAt: new Date().toISOString(),
      },
    ]);
    window.location.hash = '#/apply';
    renderApp();
    await openRecentlyRemoved(1);
    const dialog = await screen.findByRole('dialog', { name: 'Recently removed' });
    expect(
      within(dialog).getByRole('link', { name: 'Open posting for Design Engineer at Acme' }),
    ).toHaveAttribute('href', URL_A);
  });
});

const rail = () => screen.getByRole('navigation', { name: 'Jobs' });
/** The job rows in the rail, not its Change filters link or the rows' posting links. */
const railRows = () =>
  within(rail())
    .getAllByRole('link')
    .filter((l) => l.getAttribute('href')?.startsWith('#/apply/'));
/** One job's row link in the rail (its posting link beside it names the title too). */
const railRow = (title: string) => {
  const row = railRows().find((l) => l.textContent?.includes(title));
  if (!row) throw new Error(`no rail row for ${title}`);
  return row;
};

describe('job page two-pane (#130 slice 5)', () => {
  beforeEach(() => {
    addJob(URL_A, 'Design Engineer');
    addJob(URL_B, 'Welder');
  });

  it('at lg and up shows the rail and the open job, with aria-current on its row', () => {
    viewport(1280);
    openJobPage(URL_A);
    expect(screen.getByRole('heading', { level: 1, name: 'Design Engineer' })).toBeInTheDocument();
    const current = within(rail()).getByRole('link', { current: 'page' });
    expect(current).toHaveTextContent('Design Engineer');
    expect(railRow('Welder')).not.toHaveAttribute('aria-current');
    // The rail replaces the Back link.
    expect(screen.queryByRole('button', { name: /Back to Apply/ })).toBeNull();
  });

  it('every rail row opens its own posting in one tap, beside its row link (Adrian 2026-10-22)', () => {
    updateJob(URL_A, { company: 'Acme' });
    viewport(1280);
    openJobPage(URL_A);
    const rows = within(rail()).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    for (const [url, title, name] of [
      [URL_A, 'Design Engineer', 'Open posting for Design Engineer at Acme'],
      [URL_B, 'Welder', 'Open posting for Welder'],
    ]) {
      const row = railRow(title);
      const item = row.closest('li') as HTMLElement;
      const posting = within(item).getByRole('link', { name });
      expect(posting).toHaveAttribute('href', url);
      expect(posting).toHaveAttribute('target', '_blank');
      // A sibling of the row's link, never inside it (no link in a link).
      expect(row.contains(posting)).toBe(false);
      expect(posting.contains(row)).toBe(false);
    }
    // The open job's row is still the current page; the posting links are not rows.
    expect(within(rail()).getByRole('link', { current: 'page' })).toBe(railRow('Design Engineer'));
    expect(railRows()).toHaveLength(2);
  });

  it('below lg there is only the job, under the filter bar and the pager (Proposal A)', () => {
    viewport(390);
    openJobPage(URL_A);
    expect(screen.queryByRole('navigation', { name: 'Jobs' })).toBeNull();
    expect(screen.getByRole('region', { name: 'Filter jobs' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'All jobs' })).toBeInTheDocument();
  });

  it('clicking another rail row swaps the job without leaving the page', async () => {
    viewport(1280);
    openJobPage(URL_A);
    await userEvent.click(railRow('Welder'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Welder' })).toBeInTheDocument();
    expect(window.location.hash).toBe(`#/apply/${jobIdOf(URL_B)}`);
    expect(within(rail()).getByRole('link', { current: 'page' })).toHaveTextContent('Welder');
  });

  it('shows the same jobs the Pipeline list showed: its search and filter', () => {
    viewport(1280);
    setPipelineView({ q: 'welder' });
    openJobPage(URL_B);
    expect(railRows()).toHaveLength(1);
    // Status and Sort sit in the column itself (#471): no trip back to a list page.
    expect(screen.getByRole('button', { name: 'Status: Active' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Sort: / })).toBeInTheDocument();
  });

  it('the Jobs tab at lg opens on the first job beside the list (#471)', () => {
    viewport(1280);
    window.location.hash = '#/apply';
    renderApp();
    expect(screen.getByRole('heading', { level: 1, name: 'Welder' })).toBeInTheDocument();
    expect(within(rail()).getByRole('link', { current: 'page' })).toHaveTextContent('Welder');
    expect(window.location.hash).toBe('#/apply');
  });

  it('Mark applied beside the list moves on to the next job (#471)', async () => {
    viewport(1280);
    openJobPage(URL_B);
    await userEvent.click(screen.getByRole('button', { name: 'Mark applied: Welder' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Design Engineer' }),
    ).toBeInTheDocument();
    expect(window.location.hash).toBe(`#/apply/${jobIdOf(URL_A)}`);
  });

  it('pins the open job at the top with a note when the filter hides it', () => {
    viewport(1280);
    setPipelineView({ filter: 'retired' });
    openJobPage(URL_A);
    expect(railRows()[0]).toHaveAttribute('aria-current', 'page');
    expect(within(rail()).getByText('Not in this filter')).toBeInTheDocument();
  });

  it('searching in the rail narrows it', async () => {
    viewport(1280);
    openJobPage(URL_A);
    await userEvent.type(screen.getByRole('textbox', { name: 'Search jobs' }), 'Welder');
    expect(railRow('Welder')).toBeInTheDocument();
    // The open job stays, pinned, because the search hides it.
    expect(within(rail()).getByText('Not in this filter')).toBeInTheDocument();
  });

  it('marks a follow-up that is due', () => {
    viewport(1280);
    const d = new Date();
    d.setDate(d.getDate() - 10);
    const p = (n: number) => String(n).padStart(2, '0');
    updateJob(URL_B, {
      status: 'Applied',
      priority: true,
      applied: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    });
    openJobPage(URL_A);
    expect(within(rail()).getByText('Follow-up due')).toBeInTheDocument();
  });
});

describe('Company in the right column (#471 slice 2)', () => {
  beforeEach(() => {
    addJob(URL_A, 'Design Engineer');
    addJob(URL_B, 'Welder');
    updateJob(URL_A, { company: 'Acme' });
  });

  it("at lg a job's Company fact opens the Company beside the list, in the Apply tab", async () => {
    viewport(1280);
    openJobPage(URL_A);
    const fact = screen.getByRole('link', { name: 'Acme' });
    expect(fact.getAttribute('href')).toMatch(/^#\/apply\/company\/acme\?from=/);
    await userEvent.click(fact);
    expect(await screen.findByRole('heading', { level: 1, name: 'Acme' })).toBeInTheDocument();
    expect(window.location.hash).toMatch(/^#\/apply\/company\/acme/);
    // The list column stays, no row marked open; the Apply tab stays selected.
    expect(rail()).toBeInTheDocument();
    expect(within(rail()).queryByRole('link', { current: 'page' })).toBeNull();
    expect(currentTab('Apply')).toBeInTheDocument();
    // Its Back names the job it came from, and a row in the list opens a job beside it.
    expect(screen.getByRole('link', { name: 'Back to Design Engineer' })).toBeInTheDocument();
    await userEvent.click(railRow('Welder'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Welder' })).toBeInTheDocument();
  });

  it('below lg the Company stands alone with its Back; an old #/company link still opens it', async () => {
    window.location.hash = '#/company/acme';
    renderApp();
    expect(await screen.findByRole('heading', { level: 1, name: 'Acme' })).toBeInTheDocument();
    await waitFor(() => expect(window.location.hash).toBe('#/apply/company/acme'));
    expect(screen.queryByRole('navigation', { name: 'Jobs' })).toBeNull();
    // Its Back (the top tab "Apply" is a link too, outside main).
    expect(
      within(screen.getByRole('main')).getByRole('link', { name: /Back to Apply|Apply/ }),
    ).toBeInTheDocument();
  });
});

describe('job page polish and guards (#130 slice 6)', () => {
  const audit = async (el: Element) => {
    const r = await axe(el, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    });
    expect(r.violations.map((v) => `${v.id} x${v.nodes.length}`)).toEqual([]);
  };

  it.each([
    ['wide', 1280],
    ['narrow', 390],
  ])('has no WCAG A/AA violations, %s', async (_n, width) => {
    addJob(URL_A, 'Design Engineer');
    addJob(URL_B, 'Welder');
    updateJob(URL_A, {
      company: 'Acme',
      verdict: 'match',
      todos: [{ id: 't', text: 'Call', done: false }],
    });
    viewport(width);
    const { container } = openJobPage(URL_A);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    if (width >= 1024) expect(rail()).toBeInTheDocument();
    await audit(container);
  });

  it('shows a skeleton, never Job not found, for an id that has not synced yet', () => {
    window.location.hash = '#/apply/notsyncedyet';
    renderApp();
    expect(screen.getByText(/Looking for this job/)).toBeInTheDocument();
    expect(screen.queryByText('Job not found')).toBeNull();
  });

  it('opening a job from the rail starts the page at the top and keeps focus on the link', async () => {
    addJob(URL_A, 'Design Engineer');
    addJob(URL_B, 'Welder');
    viewport(1280);
    const scroll = vi.fn();
    window.scrollTo = scroll as unknown as typeof window.scrollTo;
    openJobPage(URL_A);
    await userEvent.click(railRow('Welder'));
    await screen.findByRole('heading', { level: 1, name: 'Welder' });
    expect(scroll).toHaveBeenCalledWith({ top: 0 });
    expect(railRow('Welder')).toHaveFocus();
  });
});

// Decks per job (#287): links only, http(s) only, on the job page; remove is soft with Undo. A
// plain list since #416 (Adrian's Q5): a label and a link each, Add and Remove.
describe('job page Decks (#287)', () => {
  const decksPanel = () => screen.getByRole('region', { name: 'Decks' });
  const decksOf = () => getAllJobs()[0].decks;

  it('adds a deck link with a label', async () => {
    addJob(URL_A, 'Design Engineer');
    openJobPage();
    const panel = decksPanel();
    await userEvent.click(within(panel).getByRole('button', { name: 'Add a deck link' }));
    await userEvent.type(within(panel).getByLabelText('Link'), 'https://pitch.com/v/acme');
    await userEvent.type(within(panel).getByLabelText('Label (optional)'), 'Acme pitch');
    await userEvent.click(within(panel).getByRole('button', { name: 'Add link' }));
    expect(decksOf()).toEqual([
      expect.objectContaining({ url: 'https://pitch.com/v/acme', label: 'Acme pitch' }),
    ]);
    const link = within(panel).getByRole('link', { name: /Acme pitch/ });
    expect(link).toHaveAttribute('href', 'https://pitch.com/v/acme');
  });

  it('refuses a link that is not http(s) and saves nothing', async () => {
    addJob(URL_A, 'Design Engineer');
    openJobPage();
    const panel = decksPanel();
    await userEvent.click(within(panel).getByRole('button', { name: 'Add a deck link' }));
    await userEvent.type(within(panel).getByLabelText('Link'), 'javascript:alert(1)');
    await userEvent.click(within(panel).getByRole('button', { name: 'Add link' }));
    expect(within(panel).getByText(/starts with https:/)).toBeInTheDocument();
    expect(decksOf()).toBeUndefined();
  });

  it('Enter in either field adds, and Escape cancels (#332)', async () => {
    addJob(URL_A, 'Design Engineer');
    openJobPage();
    const panel = decksPanel();
    await userEvent.click(within(panel).getByRole('button', { name: 'Add a deck link' }));
    await userEvent.type(within(panel).getByLabelText('Link'), 'https://pitch.com/v/acme');
    await userEvent.type(within(panel).getByLabelText('Label (optional)'), 'Acme{Enter}');
    expect(decksOf()).toEqual([expect.objectContaining({ label: 'Acme' })]);
    await userEvent.click(within(panel).getByRole('button', { name: 'Add a deck link' }));
    await userEvent.type(within(panel).getByLabelText('Link'), 'https://pitch.com/v/2{Escape}');
    expect(within(panel).queryByLabelText('Link')).toBeNull();
    expect(decksOf()).toHaveLength(1);
  });

  it('a new deck card flashes (#332, #212)', async () => {
    addJob(URL_A, 'Design Engineer');
    openJobPage();
    const panel = decksPanel();
    await userEvent.click(within(panel).getByRole('button', { name: 'Add a deck link' }));
    await userEvent.type(within(panel).getByLabelText('Link'), 'https://pitch.com/v/acme');
    await userEvent.type(within(panel).getByLabelText('Label (optional)'), 'Acme');
    await userEvent.click(within(panel).getByRole('button', { name: 'Add link' }));
    const card = () => within(panel).getByRole('link', { name: /Acme/ }).closest('li');
    expect(card()).toHaveAttribute('data-motion', 'flash');
  });

  it('Remove says so, and Undo puts the deck back in its place', async () => {
    addJob(URL_A, 'Design Engineer');
    const decks = [
      { id: 'd1', url: 'https://slides.example/1', label: 'One' },
      { id: 'd2', url: 'https://slides.example/2', label: 'Two' },
    ];
    updateJob(URL_A, { decks });
    openJobPage();
    await userEvent.click(within(decksPanel()).getByRole('button', { name: 'Remove “One”' }));
    await waitFor(() => expect(decksOf()?.map((d) => d.id)).toEqual(['d2']));
    expect(screen.getByText('Removed “One”')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(decksOf()).toEqual(decks);
  });
});

// Audit (2026-10-27): every inline editor on the page used to drop focus to <body> when it opened,
// closed or removed a row, so a keyboard or screen reader user lost their place.
describe('job page keeps focus where the work is', () => {
  it('Edit moves focus into the fields and Done returns it to Edit', async () => {
    addJob(URL_A, 'Design Engineer');
    updateJob(URL_A, { company: 'Acme' });
    openJobPage();
    await userEvent.click(screen.getByRole('button', { name: 'Edit details' }));
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByRole('button', { name: 'Edit details' })).toHaveFocus();
  });

  it('Saved is announced, not only shown', async () => {
    addJob(URL_A);
    openJobPage();
    await userEvent.type(screen.getByRole('textbox', { name: 'Company' }), 'A');
    expect(screen.getAllByRole('status').some((s) => s.textContent === 'Saved')).toBe(true);
  });

  it('a new link keeps the fields open, with focus on Link', async () => {
    addJob(URL_A, 'Design Engineer');
    updateJob(URL_A, { company: 'Acme' });
    openJobPage();
    await userEvent.click(screen.getByRole('button', { name: 'Edit details' }));
    const link = screen.getByRole('textbox', { name: 'Link' });
    await userEvent.clear(link);
    await userEvent.type(link, 'https://acme.example/jobs/8{Enter}');
    await waitFor(() =>
      expect(window.location.hash).toBe(`#/apply/${jobIdOf('https://acme.example/jobs/8')}`),
    );
    expect(screen.getByRole('textbox', { name: 'Link' })).toHaveFocus();
    expect(screen.getByRole('textbox', { name: 'Title' })).toBeInTheDocument();
  });

  it('Done right after a new link closes the fields in one click', async () => {
    addJob(URL_A, 'Design Engineer');
    updateJob(URL_A, { company: 'Acme' });
    openJobPage();
    await userEvent.click(screen.getByRole('button', { name: 'Edit details' }));
    const link = screen.getByRole('textbox', { name: 'Link' });
    await userEvent.clear(link);
    await userEvent.type(link, 'https://acme.example/jobs/9');
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() =>
      expect(window.location.hash).toBe(`#/apply/${jobIdOf('https://acme.example/jobs/9')}`),
    );
    expect(screen.queryByRole('textbox', { name: 'Link' })).not.toBeInTheDocument();
  });

  it('the deck form gives focus back to Add a deck link, after Add and after Cancel', async () => {
    addJob(URL_A, 'Design Engineer');
    openJobPage();
    const panel = screen.getByRole('region', { name: 'Decks' });
    await userEvent.click(within(panel).getByRole('button', { name: 'Add a deck link' }));
    await userEvent.type(within(panel).getByLabelText('Link'), 'https://pitch.com/v/acme');
    await userEvent.type(within(panel).getByLabelText('Label (optional)'), 'Acme');
    await userEvent.click(within(panel).getByRole('button', { name: 'Add link' }));
    expect(within(panel).getByRole('button', { name: 'Add a deck link' })).toHaveFocus();
    await userEvent.click(within(panel).getByRole('button', { name: 'Add a deck link' }));
    await userEvent.click(within(panel).getByRole('button', { name: 'Cancel' }));
    expect(within(panel).getByRole('button', { name: 'Add a deck link' })).toHaveFocus();
  });

  it('removing a deck moves focus to the next deck, then to Add a deck link', async () => {
    addJob(URL_A, 'Design Engineer');
    updateJob(URL_A, {
      decks: [
        { id: 'd1', url: 'https://slides.example/1', label: 'One' },
        { id: 'd2', url: 'https://slides.example/2', label: 'Two' },
      ],
    });
    openJobPage();
    const panel = screen.getByRole('region', { name: 'Decks' });
    await userEvent.click(within(panel).getByRole('button', { name: 'Remove “One”' }));
    await waitFor(() =>
      expect(within(panel).getByRole('button', { name: 'Remove “Two”' })).toHaveFocus(),
    );
    await userEvent.click(within(panel).getByRole('button', { name: 'Remove “Two”' }));
    await waitFor(() =>
      expect(within(panel).getByRole('button', { name: 'Add a deck link' })).toHaveFocus(),
    );
  });
});

describe('job dates on the job page (#419)', () => {
  it('shows one date and the closing date; Applications close sets the deadline and clears it', async () => {
    addJob(URL_A, 'Design Engineer');
    const soon = new Date();
    soon.setDate(soon.getDate() + 3);
    updateJob(URL_A, { company: 'Acme', postedAt: ymd(new Date()) });
    openJobPage();
    expect(screen.getByText(/Posted today/)).toBeInTheDocument();
    expect(screen.queryByText(/Saved \w{3} \d/)).toBeNull(); // saved is stored, not shown

    await userEvent.click(screen.getByRole('button', { name: 'Edit details' }));
    const field = screen.getByLabelText('Applications close');
    expect(field).toHaveAttribute('type', 'date');
    await userEvent.type(field, ymd(soon));
    expect(getAllJobs()[0].deadline).toBeUndefined(); // saved on leaving the field, not per key
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(getAllJobs()[0].deadline).toBe(ymd(soon));
    // #538: the amber badge under the facts names the weekday and the days left.
    const label = `Closes ${soon.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · 3 days`;
    const badge = screen.getAllByText(label).find((el) => el.closest('[data-tone]'));
    expect(badge?.closest('[data-tone]')).toHaveAttribute('data-tone', 'warning');

    await userEvent.click(screen.getByRole('button', { name: 'Edit details' }));
    await userEvent.clear(screen.getByLabelText('Applications close'));
    await userEvent.tab();
    await waitFor(() => expect('deadline' in getAllJobs()[0]).toBe(false));
  });
});
