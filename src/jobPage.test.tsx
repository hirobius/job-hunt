// The job page (#130), tested at the route seam through App: #/queue/<jobId>. Slice by slice:
// header + Overview, tabs, delete, two-pane desktop.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
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
import { addJob, findJobById, getAllJobs, jobIdOf, removeJob, updateJob } from './store';

const URL_A = 'https://acme.example/jobs/7';
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

beforeEach(() => {
  h.fake?.reset();
  localStorage.clear();
  window.history.replaceState(null, '', '/');
  window.location.hash = '';
});
afterEach(() => {
  cleanup();
  getAllJobs()
    .slice()
    .forEach((j) => removeJob(j.url));
});

describe('job page header and Overview (#130 slice 1)', () => {
  it('the header has the title, the status, a pin toggle, one primary action and a menu', () => {
    addJob(URL_A, 'Design Engineer');
    openJobPage();
    const header = screen
      .getByRole('heading', { level: 2, name: 'Design Engineer' })
      .closest('header') as HTMLElement;
    expect(header).not.toBeNull();
    expect(within(header).getByText('Saved')).toBeInTheDocument();
    expect(within(header).getByRole('button', { name: 'Pin as priority' })).toBeInTheDocument();
    expect(within(header).getByRole('button', { name: /^Mark applied/ })).toBeInTheDocument();
    expect(within(header).getByRole('button', { name: /^More actions/ })).toBeInTheDocument();
  });

  it('the primary action is Log follow-up when one is due, and Mark applied is gone', () => {
    addJob(URL_A, 'Design Engineer');
    const d = new Date();
    d.setDate(d.getDate() - 10);
    const p = (n: number) => String(n).padStart(2, '0');
    updateJob(URL_A, {
      status: 'Applied',
      applied: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    });
    openJobPage();
    expect(screen.getByRole('button', { name: /^Log follow-up/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Mark applied/ })).toBeNull();
  });

  it('pinning from the header updates the job', async () => {
    addJob(URL_A, 'Design Engineer');
    openJobPage();
    await userEvent.click(screen.getByRole('button', { name: 'Pin as priority' }));
    expect(findJobById(jobIdOf(URL_A), getAllJobs())?.priority).toBe(true);
    expect(screen.getByRole('button', { name: 'Unpin priority' })).toBeInTheDocument();
  });

  it('Overview lists the facts the job has as a definition list', () => {
    addJob(URL_A, 'Design Engineer');
    updateJob(URL_A, { company: 'Acme', location: 'Spokane, WA', salary: '$80k' });
    openJobPage();
    const facts = document.querySelector('dl') as HTMLElement;
    expect(facts).not.toBeNull();
    expect(within(facts).getByText('Company').nextElementSibling).toHaveTextContent('Acme');
    expect(within(facts).getByText('Location').nextElementSibling).toHaveTextContent('Spokane, WA');
    expect(within(facts).getByText('Salary').nextElementSibling).toHaveTextContent('$80k');
    expect(within(facts).getByText('Source').nextElementSibling).toHaveTextContent('acme.example');
    expect(within(facts).queryByText('Seniority')).toBeNull();
  });

  it('Edit details is collapsed on a job with a title and company', () => {
    addJob(URL_A, 'Design Engineer');
    updateJob(URL_A, { company: 'Acme' });
    openJobPage();
    expect(screen.getByRole('button', { name: /Edit details/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('Edit details is open on a job that is only a URL', () => {
    addJob(URL_A);
    openJobPage();
    expect(screen.getByRole('button', { name: /Edit details/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByRole('textbox', { name: 'Company' })).toBeInTheDocument();
  });

  it('editing a field updates the store and flashes Saved', async () => {
    addJob(URL_A);
    openJobPage();
    await userEvent.type(screen.getByRole('textbox', { name: 'Company' }), 'Acme');
    expect(getAllJobs()[0].company).toBe('Acme');
    expect(screen.getByText('Saved ✓')).toBeInTheDocument();
  });

  it('keeps every field reachable: contact, résumé, templates and research links', () => {
    addJob(URL_A, 'Design Engineer');
    openJobPage();
    expect(screen.getByRole('textbox', { name: 'Contact / referral' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Résumé version' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use template' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Glassdoor' })).toBeInTheDocument();
  });
});

/** The job page's own tabs, not the shell's "Sections". */
const sectionTabs = () => screen.getByRole('tablist', { name: 'Job sections' });
const tab = (name: string | RegExp) => within(sectionTabs()).getByRole('tab', { name });

describe('job page tabs (#130 slice 2)', () => {
  it('has four tabs, Overview first and selected', () => {
    addJob(URL_A, 'Design Engineer');
    openJobPage();
    const names = within(sectionTabs())
      .getAllByRole('tab')
      .map((t) => t.textContent);
    expect(names).toEqual(['Overview', 'Screening', 'Interviews', 'To-dos']);
    expect(tab('Overview')).toHaveAttribute('aria-selected', 'true');
  });

  it('puts counts on the labels of tabs that have something in them', () => {
    addJob(URL_A, 'Design Engineer');
    updateJob(URL_A, {
      events: [{ id: 'e1', kind: 'interview', date: '2026-10-20' }],
      todos: [
        { id: 't1', text: 'One', done: false },
        { id: 't2', text: 'Two', done: false },
        { id: 't3', text: 'Three', done: true },
      ],
    });
    openJobPage();
    expect(tab('Interviews (1)')).toBeInTheDocument();
    expect(tab('To-dos (2)')).toBeInTheDocument();
  });

  it('Screening is one click away and shows the fit line over the editor', async () => {
    addJob(URL_A, 'Design Engineer');
    updateJob(URL_A, {
      verdict: 'match',
      mode: 'hybrid',
      travelPct: 10,
      blockers: ['clearance'],
      applicants: 40,
    });
    openJobPage();
    await userEvent.click(tab('Screening'));
    const fit = screen.getByRole('group', { name: 'Fit summary' });
    expect(within(fit).getByText('Match')).toBeInTheDocument();
    expect(within(fit).getByText(/10% travel/)).toBeInTheDocument();
    expect(within(fit).getByText('40 applied')).toBeInTheDocument();
    expect(screen.getByText('Work mode')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Add a custom dealbreaker' })).toBeInTheDocument();
  });

  it('the JD screener is inline in Screening, no dialog, and applies to the job', async () => {
    addJob(URL_A, 'Design Engineer');
    openJobPage();
    await userEvent.click(tab('Screening'));
    await userEvent.click(screen.getByRole('button', { name: /Screen a job description/ }));
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
    expect(j.travelPct).toBe(25);
  });

  it('Interviews shows a teaching empty state, then the log', async () => {
    addJob(URL_A, 'Design Engineer');
    openJobPage();
    await userEvent.click(tab('Interviews'));
    expect(screen.getByText(/No interviews or calls yet/)).toBeInTheDocument();
    expect(screen.getByLabelText('Event date')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add to calendar' })).toBeInTheDocument();
  });

  it('To-dos has the checklist and Notes, once', async () => {
    addJob(URL_A, 'Design Engineer');
    openJobPage();
    await userEvent.click(tab('To-dos'));
    expect(screen.getByText(/No to-dos yet/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add starter tasks' }));
    expect(getAllJobs()[0].todos?.length).toBeGreaterThan(0);
    const notes = screen.getAllByRole('textbox', { name: 'Notes' });
    expect(notes).toHaveLength(1);
    await userEvent.type(notes[0], 'Ask about the shop floor');
    await userEvent.tab();
    expect(getAllJobs()[0].notes).toBe('Ask about the shop floor');
  });

  it('keeps showing a note saved the old way in the one Notes field', async () => {
    addJob(URL_A, 'Design Engineer', 'Recruiter screen');
    openJobPage();
    await userEvent.click(tab('To-dos'));
    expect(screen.getByRole('textbox', { name: 'Notes' })).toHaveValue('Recruiter screen');
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
