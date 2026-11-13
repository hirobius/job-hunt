// The job page (#130), tested at the route seam through App: #/apply/<jobId>. Slice by slice:
// header + Overview, tabs, delete, two-pane desktop.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
import {
  addJob,
  findJobById,
  getAllJobs,
  jobIdOf,
  removeJob,
  replaceAll,
  updateJob,
} from './store';
import { replaceTrash } from './trash';
import { dismissNotice } from './saveNotice';
import { ymd } from './jobEvents';
import { currentTab } from './test/topTabs';
import { setOutreachMessages } from './test/outreach';

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

  it('follow-up due: Copy follow-up is filled, Mark followed up grey, Close out the exit (#540)', () => {
    addJob(URL_A, 'Design Engineer');
    const d = new Date();
    d.setDate(d.getDate() - 10);
    const p = (n: number) => String(n).padStart(2, '0');
    updateJob(URL_A, {
      status: 'Applied',
      applied: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    });
    openJobPage();
    const dock = screen.getByRole('group', { name: 'Actions for Design Engineer' });
    const keys = [...dock.querySelectorAll('a, button')];
    expect(keys.map((k) => [k.textContent, k.getAttribute('data-variant')])).toEqual([
      ['Copy follow-up', 'primary'],
      ['Mark followed up', 'secondary'],
      ['Close out', 'link'],
    ]);
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

  it('a job with no link shows Add link, never Open application; Add link focuses its Link field (#540)', async () => {
    const NO_LINK = 'notes:designer';
    replaceAll([{ url: NO_LINK, label: 'Design Engineer', company: 'Acme', status: 'Saved' }]);
    openJobPage(NO_LINK);
    const dock = screen.getByRole('group', { name: 'Actions for Design Engineer' });
    const keys = [...dock.querySelectorAll('a, button')];
    expect(keys.map((k) => k.textContent)).toEqual(['Mark applied', 'Add link', 'Not a fit']);
    expect(keys.map((k) => k.getAttribute('data-variant'))).toEqual([
      'primary',
      'secondary',
      'link',
    ]);
    expect(screen.queryByRole('link', { name: /Open application/ })).toBeNull();
    expect(dock.querySelector('a[href]')).toBeNull();
    // Add link opens its dialog with focus on the Link field.
    await userEvent.click(within(dock).getByRole('button', { name: 'Add link: Design Engineer' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add the application link' });
    await waitFor(() =>
      expect(within(dialog).getByRole('textbox', { name: 'Application link' })).toHaveFocus(),
    );
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

  it('Notes is never lost: saved on leaving the page, even without a blur or Save', async () => {
    addJob(URL_A, 'Design Engineer');
    addJob(URL_B, 'Welder');
    updateJob(URL_A, { company: 'Acme' });
    openJobPage();
    const notes = () => screen.getByRole('textbox', { name: 'Notes' });
    // pagehide (reload, phone back gesture) flushes the draft at once.
    await userEvent.type(notes(), 'Ask about pay');
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

  it('drops the older note when Notes already repeats it', () => {
    addJob(URL_A, 'Design Engineer', 'Recruiter screen');
    updateJob(URL_A, { company: 'Acme', notes: 'Recruiter screen. Then a panel on Friday.' });
    openJobPage();
    expect(screen.queryByText(/From when you saved it/)).toBeNull();
  });

  it('saves on its Save key (on only with unsaved changes) and says so politely', async () => {
    addJob(URL_A, 'Design Engineer');
    openJobPage();
    const panel = screen.getByRole('region', { name: 'Notes' });
    const notes = within(panel).getByRole('textbox', { name: 'Notes' });
    const save = within(panel).getByRole('button', { name: 'Save' });
    const status = () => within(panel).getByRole('status');
    expect(save).toBeDisabled();
    expect(status()).toHaveTextContent('');
    await userEvent.type(notes, 'Hi');
    // No save while typing (Adrian 2026-11-13: a Save key, not autosave).
    expect(save).toBeEnabled();
    expect(findJobById(jobIdOf(URL_A))?.notes).toBeFalsy();
    fireEvent.click(save);
    expect(findJobById(jobIdOf(URL_A))?.notes).toBe('Hi');
    expect(status()).toHaveTextContent('Saved to this job');
    expect(status()).toHaveAttribute('aria-live', 'polite');
    expect(save).toBeDisabled();
    // The next edit clears the line and turns the key back on.
    await userEvent.type(notes, '!');
    expect(status()).toHaveTextContent('');
    expect(save).toBeEnabled();
    // Leaving the field still saves (blur).
    act(() => notes.blur());
    expect(findJobById(jobIdOf(URL_A))?.notes).toBe('Hi!');
    expect(save).toBeDisabled();
  });

  it('with only the older note, the Notes field shows it and no duplicate line', () => {
    addJob(URL_A, 'Design Engineer', 'Recruiter screen');
    updateJob(URL_A, { company: 'Acme' });
    openJobPage();
    expect(screen.getByRole('textbox', { name: 'Notes' })).toHaveValue('Recruiter screen');
    expect(screen.queryByText(/From when you saved it/)).toBeNull();
  });
});

/** Recently removed is in the Account menu's Data dialog (#416: off the Jobs page; #550). */
const openRecentlyRemoved = async (n: number) => {
  await userEvent.click(screen.getByRole('button', { name: /^Account/ }));
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Data' }));
  const data = await screen.findByRole('dialog', { name: 'Data' });
  await userEvent.click(within(data).getByRole('button', { name: `Recently removed (${n})` }));
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
    const length = window.history.length;
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(getAllJobs().map((j) => j.notes)).toEqual(['Ask about the shop floor']);
    expect(screen.queryByText('Removed from Apply: Design Engineer')).toBeNull();
    // #593: Undo puts the job back and never navigates.
    expect(window.location.hash).toBe('#/apply');
    expect(window.history.length).toBe(length);
  });

  it('Recently removed (in the Account menu) restores or deletes for good', async () => {
    addJob(URL_A, 'Design Engineer');
    addJob(URL_B, 'Welder');
    window.location.hash = '#/apply';
    renderApp();
    expect(screen.queryByRole('button', { name: /Recently removed/ })).toBeNull();
    // List rows carry no menu (#543): each job is removed from its own page's More menu.
    for (const left of [1, 0]) {
      await userEvent.click(await screen.findByRole('button', { name: /^More actions: / }));
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Remove from Apply' }));
      await waitFor(() => expect(getAllJobs()).toHaveLength(left));
    }
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
    // List rows carry no menu (#543): each job is removed from its own page's More menu.
    for (const left of [1, 0]) {
      await userEvent.click(await screen.findByRole('button', { name: /^More actions: / }));
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Remove from Apply' }));
      await waitFor(() => expect(getAllJobs()).toHaveLength(left));
    }
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
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Data' }));
    const data = await screen.findByRole('dialog', { name: 'Data' });
    expect(within(data).getByRole('button', { name: 'Recently removed (1)' })).toBeInTheDocument();
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

  it('rail rows are one link each; the posting is one tap away on the job itself (#543)', async () => {
    updateJob(URL_A, { company: 'Acme' });
    viewport(1280);
    openJobPage(URL_A);
    const rows = within(rail()).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    for (const [title, id] of [
      ['Design Engineer', jobIdOf(URL_A)],
      ['Welder', jobIdOf(URL_B)],
    ]) {
      const item = railRow(title).closest('li') as HTMLElement;
      // No posting glyph beside the row (#543): its one link is the job's page, named by the title.
      expect(within(item).getAllByRole('link')).toEqual([railRow(title)]);
      expect(railRow(title)).toHaveAttribute('href', `#/apply/${id}`);
      expect(railRow(title)).toHaveAccessibleName(title);
    }
    expect(within(rail()).getByRole('link', { current: 'page' })).toBe(railRow('Design Engineer'));
    expect(railRows()).toHaveLength(2);
    // The open job's posting: its header's More menu, Open posting.
    await userEvent.click(screen.getByRole('button', { name: 'More actions: Design Engineer' }));
    const open = await screen.findByRole('menuitem', { name: /^Open posting/ });
    expect(open.closest('a') ?? open).toHaveAttribute('href', URL_A);
  });

  it('below lg there is only the job, under the pager; no filter bar (Proposal A, #543)', () => {
    viewport(390);
    openJobPage(URL_A);
    expect(screen.queryByRole('navigation', { name: 'Jobs' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Filter jobs' })).toBeNull();
    expect(screen.getByRole('button', { name: 'View: To apply' })).toBeInTheDocument();
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
    // The views and Sort sit in the column itself (#471, #541): no trip back to a list page.
    expect(screen.getByRole('button', { name: /^To apply \d/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
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

  it('a job opened outside the filter stays open, with no "Not in this filter" card in the rail (#614)', () => {
    viewport(1280);
    setPipelineView({ filter: 'closed' });
    openJobPage(URL_A);
    // Nothing in the view: the column says so, with no row list and no card for the open job.
    const column = document.querySelector<HTMLElement>('.job-rail')!;
    expect(within(column).getByText('No jobs match.')).toBeInTheDocument();
    expect(within(column).queryByText('Not in this filter')).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Design Engineer' })).toBeInTheDocument();
  });

  it("a view change that hides the open job opens the list's first job instead (#614)", async () => {
    viewport(1280);
    updateJob(URL_B, { location: 'Portland, OR, or Remote within the United States' });
    openJobPage(URL_A);
    act(() => setPipelineView({ remoteOnly: true }));
    await waitFor(() => expect(window.location.hash).toBe(`#/apply/${jobIdOf(URL_B)}`));
    // Remote only is kept per device: leave it off for the next test.
    act(() => setPipelineView({ remoteOnly: false }));
  });

  it('searching in the rail narrows it, behind its search icon (#614)', async () => {
    viewport(1280);
    openJobPage(URL_A);
    expect(screen.queryByRole('textbox', { name: 'Search jobs' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Search jobs' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Search jobs' }), 'Welder');
    expect(railRow('Welder')).toBeInTheDocument();
    // Search typing never moves the open job.
    expect(window.location.hash).toBe(`#/apply/${jobIdOf(URL_A)}`);
  });

  it('marks a follow-up that is due', () => {
    viewport(1280);
    const d = new Date();
    d.setDate(d.getDate() - 10);
    const p = (n: number) => String(n).padStart(2, '0');
    updateJob(URL_B, {
      status: 'Applied',
      applied: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    });
    setPipelineView({ filter: 'followUp' });
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
    // Its Back (the top tab "Apply" is a link too, in the page bar's nav: not the Back).
    const backs = within(screen.getByRole('main'))
      .getAllByRole('link', { name: /Back to Apply|Apply/ })
      .filter((l) => !l.closest('nav'));
    expect(backs).toHaveLength(1);
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

// #540 and the interaction review (2026-11-11): the filled key follows the state.
describe('the keys follow the state (#540)', () => {
  const daysAgo = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return ymd(d);
  };

  it('no link: a fact says so, Mark applied is filled, Add link grey; Add link moves on to Open application', async () => {
    const user = userEvent.setup();
    // A job with no usable link: its stored URL does not parse as http(s) (a placeholder).
    // (A synced or restored record can carry one; the add path refuses it.)
    addJob(URL_A, 'Designer');
    updateJob(URL_A, { url: 'notes:designer' });
    openJobPage('notes:designer');
    expect(screen.getByText('No application link')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Open application/ })).toBeNull();
    const dock = screen.getByRole('group', { name: 'Actions for Designer' });
    expect(
      [...dock.querySelectorAll('a, button')].map((k) => [
        k.textContent,
        k.getAttribute('data-variant'),
      ]),
    ).toEqual([
      ['Mark applied', 'primary'],
      ['Add link', 'secondary'],
      ['Not a fit', 'link'],
    ]);
    await user.click(within(dock).getByRole('button', { name: 'Add link: Designer' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add the application link' });
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Application link' }),
      'https://boards.example.com/jobs/9',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Add link' }));
    const open = await screen.findByRole('link', { name: /Open application/ });
    expect(open).toHaveAttribute('href', 'https://boards.example.com/jobs/9');
    expect(screen.queryByText('No application link')).toBeNull();
    await waitFor(() => expect(open).toHaveFocus());
  });

  // #593: the link is checked before anything is written.
  const openAddLink = async (user: ReturnType<typeof userEvent.setup>) => {
    addJob(URL_A, 'Designer');
    updateJob(URL_A, { url: 'notes:designer' });
    openJobPage('notes:designer');
    const dock = screen.getByRole('group', { name: 'Actions for Designer' });
    await user.click(within(dock).getByRole('button', { name: 'Add link: Designer' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add the application link' });
    return { dialog, field: within(dialog).getByRole('textbox', { name: 'Application link' }) };
  };

  it('Add link: an address a browser cannot open saves nothing and says so, never "Link added"', async () => {
    const user = userEvent.setup();
    const { dialog, field } = await openAddLink(user);
    const before = getAllJobs().map((j) => j.url);
    await user.type(field, 'https://a b.c');
    await user.click(within(dialog).getByRole('button', { name: 'Add link' }));
    expect(
      await within(dialog).findByText(/^That is not a web address\. Paste the full link/),
    ).toBeInTheDocument();
    expect(getAllJobs().map((j) => j.url)).toEqual(before);
    expect(screen.getByRole('dialog', { name: 'Add the application link' })).toBeInTheDocument();
    expect(screen.queryByText(/^Link added/)).toBeNull();
    expect(window.location.hash).toBe(`#/apply/${jobIdOf('notes:designer')}`);
    // No dot is no address either.
    await user.clear(field);
    await user.type(field, 'designer{Enter}');
    expect(await within(dialog).findByText(/^That is not a web address/)).toBeInTheDocument();
    expect(getAllJobs().map((j) => j.url)).toEqual(before);
  });

  it('Add link: another saved job’s link saves nothing and names that job', async () => {
    const user = userEvent.setup();
    addJob(URL_B, 'Zenith Designer');
    const { dialog, field } = await openAddLink(user);
    await user.type(field, URL_B);
    await user.click(within(dialog).getByRole('button', { name: 'Add link' }));
    expect(
      await within(dialog).findByText('That link is already saved: Zenith Designer.'),
    ).toBeInTheDocument();
    expect(getAllJobs().filter((j) => j.url === URL_B)).toHaveLength(1);
    expect(getAllJobs().some((j) => j.url === 'notes:designer')).toBe(true);
    expect(screen.queryByText(/^Link added/)).toBeNull();
    // Typing again clears the error; a good link then saves.
    await user.clear(field);
    expect(within(dialog).queryByText(/already saved/)).toBeNull();
    await user.type(field, 'boards.example.com/jobs/9');
    await user.click(within(dialog).getByRole('button', { name: 'Add link' }));
    expect(await screen.findByText('Link added: Designer')).toBeInTheDocument();
    expect(getAllJobs().some((j) => j.url === 'https://boards.example.com/jobs/9')).toBe(true);
  });

  it('Close out opens the next job in the list and focuses its title (#593)', async () => {
    const user = userEvent.setup();
    // Both due, so the Follow up view shows them: newest first, Beta then Alpha.
    addJob(URL_A, 'Alpha Designer');
    addJob(URL_B, 'Beta Designer');
    for (const url of [URL_A, URL_B]) updateJob(url, { status: 'Applied', applied: daysAgo(10) });
    setPipelineView({ filter: 'followUp' });
    openJobPage(URL_A);
    await user.click(screen.getByRole('button', { name: 'Close out: Alpha Designer' }));
    expect(getAllJobs().find((j) => j.url === URL_A)?.archived).toBe(true);
    await waitFor(() => expect(window.location.hash).toBe(`#/apply/${jobIdOf(URL_B)}`));
    // Remote only is kept per device: leave it off for the next test.
    act(() => setPipelineView({ remoteOnly: false }));
    const next = await screen.findByRole('heading', { level: 1, name: 'Beta Designer' });
    await waitFor(() => expect(next).toHaveFocus());
  });

  it('Close out on the last job goes back to the list, its heading focused (#593)', async () => {
    const user = userEvent.setup();
    addJob(URL_A, 'Alpha Designer');
    updateJob(URL_A, { status: 'Applied', applied: daysAgo(10) });
    openJobPage(URL_A);
    await user.click(screen.getByRole('button', { name: 'Close out: Alpha Designer' }));
    await waitFor(() => expect(window.location.hash).toBe('#/apply'));
    expect(getAllJobs().find((j) => j.url === URL_A)?.archived).toBe(true);
    // The tab's page heading takes focus, never <body>.
    await waitFor(() => {
      const h1 = screen.getByRole('heading', { level: 1 });
      expect(h1).toHaveFocus();
    });
    expect(screen.queryByRole('group', { name: /^Actions for / })).toBeNull();
  });

  it('Mark followed up restarts the clock with Undo; focus stays on the title', async () => {
    const user = userEvent.setup();
    addJob(URL_A, 'Design Engineer');
    updateJob(URL_A, { status: 'Applied', applied: daysAgo(10) });
    openJobPage();
    await user.click(screen.getByRole('button', { name: 'Mark followed up: Design Engineer' }));
    expect(findJobById(jobIdOf(URL_A), getAllJobs())?.followUp).toBeTruthy();
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 })),
    );
    const notice = await screen.findByText('Marked followed up: Design Engineer');
    const toast = notice.closest('li') as HTMLElement;
    await user.click(within(toast).getByRole('button', { name: 'Undo' }));
    expect(findJobById(jobIdOf(URL_A), getAllJobs())?.followUp).toBeFalsy();
  });

  it('Close out sets the job aside with Undo that puts every field back', async () => {
    const user = userEvent.setup();
    addJob(URL_A, 'Design Engineer');
    updateJob(URL_A, { status: 'Applied', applied: daysAgo(10), notes: 'keep me' });
    const before = { ...getAllJobs().find((j) => j.url === URL_A)! };
    openJobPage();
    await user.click(screen.getByRole('button', { name: 'Close out: Design Engineer' }));
    expect(getAllJobs().find((j) => j.url === URL_A)?.archived).toBe(true);
    const notice = await screen.findByText('Closed out: Design Engineer');
    await user.click(
      within(notice.closest('li') as HTMLElement).getByRole('button', { name: 'Undo' }),
    );
    const after = getAllJobs().find((j) => j.url === URL_A)!;
    expect({ ...after, archived: after.archived || undefined }).toEqual({
      ...before,
      archived: before.archived || undefined,
    });
  });

  it('Copy follow-up with a failed clipboard shows the text to copy by hand', async () => {
    const user = userEvent.setup();
    setOutreachMessages([
      { id: 'tpl-followup', label: 'Follow-up after applying', body: 'Checking in on [Role].' },
    ]);
    addJob(URL_A, 'Design Engineer');
    updateJob(URL_A, { status: 'Applied', applied: daysAgo(10) });
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(new Error('denied'));
    openJobPage();
    await user.click(screen.getByRole('button', { name: 'Copy follow-up: Design Engineer' }));
    expect(await screen.findByText(/^Couldn’t copy the follow-up\./)).toBeInTheDocument();
    expect(screen.getAllByText(/Checking in on/).length).toBeGreaterThan(0);
    setOutreachMessages([]);
  });
});
