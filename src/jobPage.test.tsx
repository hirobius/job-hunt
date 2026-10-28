// The job page (#130), tested at the route seam through App: #/queue/<jobId>. Slice by slice:
// header + Overview, tabs, delete, two-pane desktop.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
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
  window.location.hash = `#/queue/${jobIdOf(url)}`;
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
      .getByRole('heading', { level: 2, name: 'Design Engineer' })
      .closest('header') as HTMLElement;
    expect(header).not.toBeNull();
    expect(within(header).getByText('Saved')).toBeInTheDocument();
    const star = within(header).getByRole('button', { name: 'Star' });
    expect(star).not.toHaveAttribute('aria-pressed'); // the text carries the state
    expect(within(header).getByRole('button', { name: /^Mark applied/ })).toBeInTheDocument();
    expect(within(header).getByRole('button', { name: /^More actions/ })).toBeInTheDocument();
  });

  it('the header opens the posting in one tap from beside the title (Adrian 2026-10-22)', () => {
    addJob(URL_A, 'Design Engineer');
    updateJob(URL_A, { company: 'Acme' });
    openJobPage();
    const header = screen
      .getByRole('heading', { level: 2, name: 'Design Engineer' })
      .closest('header') as HTMLElement;
    const posting = within(header).getByRole('link', {
      name: 'Open posting for Design Engineer at Acme',
    });
    expect(posting).toHaveAttribute('href', URL_A);
    expect(posting).toHaveAttribute('target', '_blank');
    // Beside the title, not inside the heading; the next step stays the header's one primary.
    expect(posting.closest('h2')).toBeNull();
    expect(within(header).getByRole('button', { name: /^Mark applied/ })).toBeInTheDocument();
  });

  it('a job that is only a URL still opens its posting from the header', () => {
    addJob(URL_A);
    openJobPage();
    // Details opens as fields (no link fact), so the header is the one-tap way out.
    expect(screen.getByRole('textbox', { name: 'Link' })).toBeInTheDocument();
    const header = screen.getByRole('heading', { level: 2 }).closest('header') as HTMLElement;
    expect(within(header).getByRole('link', { name: /^Open posting/ })).toHaveAttribute(
      'href',
      URL_A,
    );
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

  it("an Interviewing job's one primary is Add interview, which opens the Interviews tab", async () => {
    addJob(URL_A, 'Design Engineer');
    updateJob(URL_A, { status: 'Interviewing', applied: todayYmd() });
    openJobPage();
    const header = screen
      .getByRole('heading', { level: 2, name: 'Design Engineer' })
      .closest('header') as HTMLElement;
    await userEvent.click(within(header).getByRole('button', { name: 'Add interview' }));
    expect(
      within(screen.getByRole('tablist', { name: 'Job sections' })).getByRole('tab', {
        name: /^Interviews/,
      }),
    ).toHaveAttribute('aria-selected', 'true');
  });

  it('with no next step the action row is just Star and More, no empty slot between', () => {
    addJob(URL_A, 'Design Engineer');
    updateJob(URL_A, { status: 'Offer', applied: todayYmd() });
    openJobPage();
    const star = screen.getByRole('button', { name: 'Star' });
    const row = star.closest('[data-rjb-actions]') as HTMLElement;
    expect(row).not.toBeNull();
    // (The menu's hidden portal anchor is not a slot.)
    expect([...row.children].filter((c) => !(c as HTMLElement).hidden)).toHaveLength(2);
    expect(
      within(row)
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label') ?? b.textContent),
    ).toEqual(['Star', expect.stringMatching(/^More actions/)]);
  });

  it('starring fills the star, says Starred and where starred jobs show', async () => {
    addJob(URL_A, 'Design Engineer');
    openJobPage();
    await userEvent.click(screen.getByRole('button', { name: 'Star' }));
    expect(findJobById(jobIdOf(URL_A), getAllJobs())?.priority).toBe(true);
    const on = screen.getByRole('button', { name: 'Starred' });
    expect(on.querySelector('svg')).toHaveClass('rjb-icon-filled');
    expect(await screen.findByText('Shows first in your Pipeline')).toBeInTheDocument();
    await userEvent.click(on);
    expect(findJobById(jobIdOf(URL_A), getAllJobs())?.priority).toBe(false);
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
      expect(window.location.hash).toBe(`#/queue/${jobIdOf('https://acme.example/jobs/8')}`),
    );
  });

  it('keeps templates on Overview and research links in the header menu', async () => {
    addJob(URL_A, 'Design Engineer');
    updateJob(URL_A, { company: 'Acme' });
    openJobPage();
    expect(screen.getByRole('button', { name: 'Use template' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^Glassdoor/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /^More actions/ }));
    expect(await screen.findByRole('menuitem', { name: /^Glassdoor/ })).toBeInTheDocument();
  });
});

/** The job page's own tabs, not the shell's "Sections". */
const sectionTabs = () => screen.getByRole('tablist', { name: 'Job sections' });
const tab = (name: string | RegExp) => within(sectionTabs()).getByRole('tab', { name });

describe('job page tabs (#130 slice 2)', () => {
  it('has three tabs, Overview first and selected (rev-3 F)', () => {
    addJob(URL_A, 'Design Engineer');
    openJobPage();
    const names = within(sectionTabs())
      .getAllByRole('tab')
      .map((t) => t.textContent);
    expect(names).toEqual(['Overview', 'Screening', 'Interviews']);
    expect(tab('Overview')).toHaveAttribute('aria-selected', 'true');
  });

  it('counts interviews on the tab and open to-dos on the panel', () => {
    addJob(URL_A, 'Design Engineer');
    updateJob(URL_A, {
      company: 'Acme',
      events: [{ id: 'e1', kind: 'interview', date: '2026-10-20' }],
      todos: [
        { id: 't1', text: 'One', done: false },
        { id: 't2', text: 'Two', done: false },
        { id: 't3', text: 'Three', done: true },
      ],
    });
    openJobPage();
    // The count is the neutral pill Badge (rev-2 #2), not "(1)" text.
    const interviews = tab(/^Interviews/);
    expect(interviews.textContent).not.toContain('(');
    expect(within(interviews).getByRole('img', { name: '1 booked' })).toHaveTextContent('1');
    expect(within(screen.getByRole('region', { name: 'To-dos' })).getByText('2')).toBeVisible();
  });

  it('Screening is one click away: the Fit panel holds the editor', async () => {
    addJob(URL_A, 'Design Engineer');
    updateJob(URL_A, {
      verdict: 'match',
      mode: 'hybrid',
      blockers: ['clearance'],
    });
    openJobPage();
    await userEvent.click(tab('Screening'));
    const fit = screen.getByRole('region', { name: 'Fit' });
    expect(within(fit).getByText('Strong fit')).toBeInTheDocument();
    expect(within(fit).queryByText(/travel|applied/)).toBeNull();
    expect(screen.getByText('Work mode')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Add a custom dealbreaker' })).toBeInTheDocument();
  });

  it('the JD screener is inline in Screening, no dialog, and applies to the job', async () => {
    addJob(URL_A, 'Design Engineer');
    openJobPage();
    await userEvent.click(tab('Screening'));
    // A panel like the others (rev-3): bold heading, a full helper line, an Open button.
    const jd = screen.getByRole('region', { name: 'Screen a job description' });
    expect(
      within(jd).getByRole('heading', { name: 'Screen a job description' }),
    ).toBeInTheDocument();
    expect(
      within(jd).getByText('Paste the posting to get a suggested fit, mode and dealbreakers.'),
    ).toBeInTheDocument();
    const toggle = within(jd).getByRole('button', { name: 'Open' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggle);
    expect(within(jd).getByRole('button', { name: 'Close' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Job description' }),
      'Fully remote role. Must hold an active security clearance. Up to 25% travel.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Screen' }));
    await userEvent.click(screen.getByRole('button', { name: 'Apply to this job' }));
    const j = getAllJobs()[0];
    expect(j.verdict).toBeTruthy();
    expect(j.screenedAt).toBeTruthy();
  });

  it('Interviews shows a teaching empty state, then the log', async () => {
    addJob(URL_A, 'Design Engineer');
    openJobPage();
    await userEvent.click(tab('Interviews'));
    expect(screen.getByText(/No interviews yet/)).toBeInTheDocument();
    expect(screen.getByLabelText('Event date')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add to calendar' })).toBeInTheDocument();
  });

  it('Overview has the to-do checklist and Notes, once', async () => {
    addJob(URL_A, 'Design Engineer');
    updateJob(URL_A, { company: 'Acme' });
    openJobPage();
    // Empty: a quiet "Add a to-do" line opens the field (rev-3 mock).
    expect(screen.queryByRole('textbox', { name: 'New to-do' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Add a to-do' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'New to-do' }), 'Call Sam{Enter}');
    expect(getAllJobs()[0].todos?.map((t) => t.text)).toEqual(['Call Sam']);
    updateJob(URL_A, { todos: [] });
    await userEvent.click(await screen.findByRole('button', { name: 'Add starter tasks' }));
    expect(getAllJobs()[0].todos?.length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Add starter tasks' })).toBeNull();
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
      window.location.hash = '#/queue';
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

  it('opens on Overview again when the job changes', async () => {
    addJob(URL_A, 'Design Engineer');
    addJob(URL_B, 'Welder');
    openJobPage(URL_A);
    await userEvent.click(tab('Screening'));
    act(() => {
      window.location.hash = `#/queue/${jobIdOf(URL_B)}`;
    });
    expect(await screen.findByRole('heading', { level: 2, name: 'Welder' })).toBeInTheDocument();
    expect(tab('Overview')).toHaveAttribute('aria-selected', 'true');
  });
});

// Removing a to-do or an interview (#212): the row collapses before it goes, a notice says so, and
// Undo puts it back where it was.
describe('job page to-do and interview removal (#212)', () => {
  /** Motion on: the browser can tell, and no reduced motion is asked for. */
  const motionOn = () =>
    (window.matchMedia = vi.fn().mockImplementation((media: string) => ({
      matches: false,
      media,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia);
  const todo = (id: string, text: string) => ({ id, text, done: false });
  const todoIds = () => getAllJobs()[0].todos?.map((t) => t.id);

  it('Delete on a to-do collapses its row, says so, and Undo puts it back in its place', async () => {
    addJob(URL_A, 'Design Engineer');
    updateJob(URL_A, {
      todos: [todo('t1', 'Research'), todo('t2', 'Tailor'), todo('t3', 'Submit')],
    });
    motionOn();
    openJobPage();
    const del = screen.getByRole('button', { name: 'Delete “Tailor”' });
    await userEvent.click(del);
    expect(del.closest('li')).toHaveAttribute('data-motion', 'collapse');
    await waitFor(() => expect(todoIds()).toEqual(['t1', 't3']));
    expect(screen.getByText('Deleted “Tailor”')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(todoIds()).toEqual(['t1', 't2', 't3']);
  });

  it('two deletes inside one collapse both stick', async () => {
    addJob(URL_A, 'Design Engineer');
    updateJob(URL_A, {
      todos: [todo('t1', 'Research'), todo('t2', 'Tailor'), todo('t3', 'Submit')],
    });
    motionOn();
    openJobPage();
    await userEvent.click(screen.getByRole('button', { name: 'Delete “Research”' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete “Submit”' }));
    await waitFor(() => expect(todoIds()).toEqual(['t2']));
    await new Promise((r) => setTimeout(r, 300));
    expect(todoIds()).toEqual(['t2']);
  });

  it('Remove on an interview says so, and Undo brings it back', async () => {
    addJob(URL_A, 'Design Engineer');
    updateJob(URL_A, {
      events: [{ id: 'e1', kind: 'interview', date: '2030-01-08', time: '14:00', note: 'Panel' }],
    });
    openJobPage();
    await userEvent.click(screen.getByRole('tab', { name: /^Interviews/ }));
    await userEvent.click(screen.getByRole('button', { name: /^Remove interview on / }));
    expect(getAllJobs()[0].events).toEqual([]);
    expect(screen.getByText('Removed interview')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(getAllJobs()[0].events).toEqual([
      { id: 'e1', kind: 'interview', date: '2030-01-08', time: '14:00', note: 'Panel' },
    ]);
  });
});

describe('job page remove (Recently removed)', () => {
  it('Remove is in the header menu; Overview has no delete section', async () => {
    addJob(URL_A, 'Design Engineer');
    openJobPage();
    expect(screen.queryByRole('button', { name: /Remove this job/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /^More actions/ }));
    expect(screen.getByRole('menuitem', { name: 'Remove' })).toBeInTheDocument();
  });

  it('removes without asking, returns to the list, and Undo brings it back whole', async () => {
    addJob(URL_A, 'Design Engineer');
    updateJob(URL_A, { notes: 'Ask about the shop floor' });
    openJobPage();
    await userEvent.click(screen.getByRole('button', { name: /^More actions/ }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Remove' }));
    expect(getAllJobs()).toHaveLength(0);
    await waitFor(() => expect(window.location.hash).toBe('#/queue'));
    expect(screen.getByText('Removed “Design Engineer”')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(getAllJobs().map((j) => j.notes)).toEqual(['Ask about the shop floor']);
    expect(screen.queryByText('Removed “Design Engineer”')).toBeNull();
  });

  it('Recently removed (under the Pipeline list) restores or deletes for good', async () => {
    addJob(URL_A, 'Design Engineer');
    addJob(URL_B, 'Welder');
    window.location.hash = '#/queue';
    renderApp();
    expect(screen.queryByRole('button', { name: /Recently removed/ })).toBeNull();
    for (const name of ['Design Engineer', 'Welder']) {
      await userEvent.click(screen.getByRole('button', { name: `More actions: ${name}` }));
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Remove' }));
    }
    await userEvent.click(screen.getByRole('button', { name: 'Recently removed (2)' }));
    const dialog = await screen.findByRole('dialog', { name: 'Recently removed' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Restore: Welder' }));
    expect(getAllJobs().map((j) => j.label)).toEqual(['Welder']);
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Delete forever: Design Engineer' }),
    );
    expect(getAllJobs().map((j) => j.label)).toEqual(['Welder']);
    expect(screen.queryByRole('button', { name: /Recently removed/ })).toBeNull();
  });

  it('Delete forever offers Undo inside the dialog, and Undo puts the job back in the list', async () => {
    addJob(URL_A, 'Design Engineer');
    addJob(URL_B, 'Welder');
    updateJob(URL_A, { notes: 'Ask about the shop floor' });
    window.location.hash = '#/queue';
    renderApp();
    for (const name of ['Design Engineer', 'Welder']) {
      await userEvent.click(screen.getByRole('button', { name: `More actions: ${name}` }));
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Remove' }));
    }
    await userEvent.click(screen.getByRole('button', { name: 'Recently removed (2)' }));
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
    window.location.hash = '#/queue';
    renderApp();
    await userEvent.click(screen.getByRole('button', { name: 'More actions: Design Engineer' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Remove' }));
    await userEvent.click(screen.getByRole('button', { name: 'Recently removed (1)' }));
    const dialog = await screen.findByRole('dialog', { name: 'Recently removed' });
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Delete forever: Design Engineer' }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    expect(await screen.findByRole('button', { name: 'Recently removed (1)' })).toBeInTheDocument();
  });

  it('a removed job still opens its posting from Recently removed (Adrian 2026-10-22)', async () => {
    addJob(URL_B, 'Welder');
    replaceTrash([
      {
        job: { url: URL_A, label: 'Design Engineer', company: 'Acme', status: 'Saved' },
        removedAt: new Date().toISOString(),
      },
    ]);
    window.location.hash = '#/queue';
    renderApp();
    await userEvent.click(screen.getByRole('button', { name: 'Recently removed (1)' }));
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
    .filter((l) => l.getAttribute('href')?.startsWith('#/queue/'));
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
    expect(screen.getByRole('heading', { level: 2, name: 'Design Engineer' })).toBeInTheDocument();
    const current = within(rail()).getByRole('link', { current: 'page' });
    expect(current).toHaveTextContent('Design Engineer');
    expect(railRow('Welder')).not.toHaveAttribute('aria-current');
    // The rail replaces the Back link.
    expect(screen.queryByRole('button', { name: /Back to Pipeline/ })).toBeNull();
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

  it('below lg there is only the job, with Back', () => {
    viewport(390);
    openJobPage(URL_A);
    expect(screen.queryByRole('navigation', { name: 'Jobs' })).toBeNull();
    expect(screen.getByRole('button', { name: /Back to Pipeline/ })).toBeInTheDocument();
  });

  it('clicking another rail row swaps the job without leaving the page', async () => {
    viewport(1280);
    openJobPage(URL_A);
    await userEvent.click(railRow('Welder'));
    expect(await screen.findByRole('heading', { level: 2, name: 'Welder' })).toBeInTheDocument();
    expect(window.location.hash).toBe(`#/queue/${jobIdOf(URL_B)}`);
    expect(within(rail()).getByRole('link', { current: 'page' })).toHaveTextContent('Welder');
    expect(screen.getByRole('tab', { name: 'Overview', selected: true })).toBeInTheDocument();
  });

  it('shows the same jobs the Pipeline list showed: its search and filter', () => {
    viewport(1280);
    setPipelineView({ q: 'welder' });
    openJobPage(URL_B);
    expect(railRows()).toHaveLength(1);
    expect(within(rail()).getByText(/Change filters/)).toHaveAttribute('href', '#/queue');
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
    await userEvent.type(within(rail()).getByRole('textbox', { name: 'Search jobs' }), 'Welder');
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
  ])('has no WCAG A/AA violations, %s, on every tab', async (_n, width) => {
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
    expect(screen.getByRole('tablist', { name: 'Job sections' })).toBeInTheDocument();
    if (width >= 1024) expect(rail()).toBeInTheDocument();
    for (const name of ['Overview', 'Screening', 'Interviews']) {
      await userEvent.click(tab(name));
      await audit(container);
    }
  });

  it('shows a skeleton, never Job not found, for an id that has not synced yet', () => {
    window.location.hash = '#/queue/notsyncedyet';
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
    await screen.findByRole('heading', { level: 2, name: 'Welder' });
    expect(scroll).toHaveBeenCalledWith({ top: 0 });
    expect(railRow('Welder')).toHaveFocus();
  });
});

// Decks per job (#287): links only, http(s) only, on the Overview; remove is soft with Undo.
describe('job page Decks (#287)', () => {
  const decksPanel = () => screen.getByRole('region', { name: 'Decks' });
  const decksOf = () => getAllJobs()[0].decks;

  it('adds a deck link with a label and a Sent on day', async () => {
    addJob(URL_A, 'Design Engineer');
    openJobPage();
    const panel = decksPanel();
    await userEvent.click(within(panel).getByRole('button', { name: 'Add a deck link' }));
    await userEvent.type(within(panel).getByLabelText('Deck link'), 'https://pitch.com/v/acme');
    await userEvent.type(within(panel).getByLabelText('Label (optional)'), 'Acme pitch');
    await userEvent.type(within(panel).getByLabelText('Sent on (optional)'), '2026-10-20');
    await userEvent.click(within(panel).getByRole('button', { name: 'Add deck' }));
    expect(decksOf()).toEqual([
      expect.objectContaining({
        url: 'https://pitch.com/v/acme',
        label: 'Acme pitch',
        sentOn: '2026-10-20',
      }),
    ]);
    const link = within(panel).getByRole('link', { name: /Acme pitch/ });
    expect(link).toHaveAttribute('href', 'https://pitch.com/v/acme');
    expect(within(panel).getByText(/^Sent on /)).toBeInTheDocument();
  });

  it('refuses a link that is not http(s) and saves nothing', async () => {
    addJob(URL_A, 'Design Engineer');
    openJobPage();
    const panel = decksPanel();
    await userEvent.click(within(panel).getByRole('button', { name: 'Add a deck link' }));
    await userEvent.type(within(panel).getByLabelText('Deck link'), 'javascript:alert(1)');
    await userEvent.click(within(panel).getByRole('button', { name: 'Add deck' }));
    expect(within(panel).getByText(/starts with https:/)).toBeInTheDocument();
    expect(decksOf()).toBeUndefined();
  });

  it('edits a deck in place', async () => {
    addJob(URL_A, 'Design Engineer');
    updateJob(URL_A, { decks: [{ id: 'd1', url: 'https://slides.example/1', label: 'Old' }] });
    openJobPage();
    const panel = decksPanel();
    expect(within(panel).getByText('Not sent yet')).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole('button', { name: 'Edit “Old”' }));
    const label = within(panel).getByLabelText('Label (optional)');
    await userEvent.clear(label);
    await userEvent.type(label, 'Portfolio');
    await userEvent.type(within(panel).getByLabelText('Sent on (optional)'), '2026-10-21');
    await userEvent.click(within(panel).getByRole('button', { name: 'Save' }));
    expect(decksOf()).toEqual([
      { id: 'd1', url: 'https://slides.example/1', label: 'Portfolio', sentOn: '2026-10-21' },
    ]);
    expect(within(panel).getByRole('link', { name: /Portfolio/ })).toBeInTheDocument();
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
  const todo = (id: string, text: string) => ({ id, text, done: false });

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
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
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
      expect(window.location.hash).toBe(`#/queue/${jobIdOf('https://acme.example/jobs/8')}`),
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
      expect(window.location.hash).toBe(`#/queue/${jobIdOf('https://acme.example/jobs/9')}`),
    );
    expect(screen.queryByRole('textbox', { name: 'Link' })).not.toBeInTheDocument();
  });

  it('Escape closes the new to-do field and focus returns to Add a to-do', async () => {
    addJob(URL_A, 'Design Engineer');
    openJobPage();
    await userEvent.click(screen.getByRole('button', { name: 'Add a to-do' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: 'Add a to-do' })).toHaveFocus();
  });

  it('deleting a to-do moves focus to the next one, then to Add a to-do', async () => {
    addJob(URL_A, 'Design Engineer');
    updateJob(URL_A, { todos: [todo('t1', 'Research'), todo('t2', 'Tailor')] });
    openJobPage();
    await userEvent.click(screen.getByRole('button', { name: 'Delete “Research”' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Delete “Tailor”' })).toHaveFocus(),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Delete “Tailor”' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add a to-do' })).toHaveFocus());
  });

  it('a deck form gives focus back: Add to Add a deck link, Save and Cancel to its Edit', async () => {
    addJob(URL_A, 'Design Engineer');
    openJobPage();
    const panel = screen.getByRole('region', { name: 'Decks' });
    await userEvent.click(within(panel).getByRole('button', { name: 'Add a deck link' }));
    await userEvent.type(within(panel).getByLabelText('Deck link'), 'https://pitch.com/v/acme');
    await userEvent.type(within(panel).getByLabelText('Label (optional)'), 'Acme');
    await userEvent.click(within(panel).getByRole('button', { name: 'Add deck' }));
    expect(within(panel).getByRole('button', { name: 'Add a deck link' })).toHaveFocus();
    await userEvent.click(within(panel).getByRole('button', { name: 'Edit “Acme”' }));
    await userEvent.click(within(panel).getByRole('button', { name: 'Cancel' }));
    expect(within(panel).getByRole('button', { name: 'Edit “Acme”' })).toHaveFocus();
    await userEvent.click(within(panel).getByRole('button', { name: 'Edit “Acme”' }));
    await userEvent.click(within(panel).getByRole('button', { name: 'Save' }));
    expect(within(panel).getByRole('button', { name: 'Edit “Acme”' })).toHaveFocus();
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
