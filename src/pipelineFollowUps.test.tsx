// Calm list 2/7 (#236): Today is gone. Due follow-ups and the next 7 days of interviews and calls
// live at the top of the Pipeline, under To apply, as one Follow up section (due first, then the
// rest with their dates) and one Next 7 days list. `#/today` is home again (#383). Tested at the
// route seam through App and driven by role + name.
import { itemsInLine, MAX_META_ITEMS } from './metaLines';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
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
import {
  addJob,
  addJobDetailed,
  getAllJobs,
  jobIdOf,
  markAppliedByUrl,
  removeJob,
  updateJob,
} from './store';
import { ymd } from './jobEvents';
import { loadSample } from './demo/loadSample';
import { replaceCurationState } from './curation/curationStore';
import { seedPack } from './curation/starterPacks';
import { STARTER_SNIPPETS } from './copyDeckStore';
import { getAllDocuments } from './documents';
import { setOutreachMessages } from './test/outreach';

const renderApp = () =>
  render(
    <ColorModeProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ColorModeProvider>,
  );

const region = (name: RegExp) => screen.getByRole('region', { name });
const followUps = () => region(/^Follow up \(/);
/** A row's job title: its first link. */
const titleOf = (row: HTMLElement) => within(row).getAllByRole('link')[0].textContent;

beforeEach(() => {
  h.fake?.reset();
  localStorage.clear();
  replaceCurationState({ categories: [], groups: [], tiles: [] });
  window.history.replaceState(null, '', '/');
  window.location.hash = '#/queue';
});
afterEach(() => {
  cleanup();
  getAllJobs()
    .slice()
    .forEach((j) => removeJob(j.url));
  replaceCurationState({ categories: [], groups: [], tiles: [] });
});

describe('#/today is home again (#383; was retired in #236)', () => {
  it('opens Today, not Companies', async () => {
    seedPack('consulting');
    window.location.hash = '#/today';
    renderApp();
    expect(screen.getByRole('tab', { selected: true })).toHaveAccessibleName('Today');
    expect(window.location.hash).toBe('#/today');
    expect(screen.getByRole('heading', { level: 2, name: 'Today' })).toBeInTheDocument();
  });

  it('an empty hash lands on Today', async () => {
    seedPack('consulting');
    window.location.hash = '';
    renderApp();
    expect(screen.getByRole('tab', { selected: true })).toHaveAccessibleName('Today');
    await waitFor(() => expect(window.location.hash).toBe('#/today'));
  });

  it('a ?add= quick-add link still lands on the Pipeline', () => {
    window.history.replaceState(null, '', '/?add=https://acme.example/jobs/9');
    renderApp();
    expect(window.location.hash).toBe('#/queue');
    expect(screen.getByRole('tab', { selected: true })).toHaveAccessibleName('Jobs');
  });
});

describe('Follow-ups in the Pipeline (#236)', () => {
  beforeEach(() => {
    loadSample();
    // The starter messages are the user's to add (a clean first run): these tests have them.
    setOutreachMessages([...STARTER_SNIPPETS]);
  });

  it('one Follow up section: the due ones first, marked Due, each with its own Follow up', () => {
    renderApp();
    const rows = within(followUps()).getAllByRole('listitem');
    const due = rows.filter((r) => within(r).queryByText('Follow-up due'));
    expect(due.map(titleOf)).toEqual(['UX Researcher', 'Design Systems Lead']);
    // The due rows lead the list, and only they carry the action.
    expect(rows.slice(0, 2)).toEqual(due);
    for (const r of due) expect(within(r).getAllByRole('button')).toHaveLength(1);
    for (const r of rows.slice(2)) expect(within(r).queryByRole('button')).toBeNull();
    expect(within(due[0]).getAllByRole('link')[0]).toHaveAttribute(
      'href',
      `#/queue/${jobIdOf('https://brambleandfinch.example.com/jobs/ux-researcher')}`,
    );
    // No job shows twice in the section.
    const names = rows.map(titleOf);
    expect(new Set(names).size).toBe(names.length);
  });

  const UXR = 'https://brambleandfinch.example.com/jobs/ux-researcher';
  const dueNames = () =>
    within(followUps())
      .getAllByRole('listitem')
      .filter((r) => within(r).queryByText('Follow-up due'))
      .map(titleOf);
  const openFollowUp = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(within(followUps()).getByRole('button', { name: 'Follow up: UX Researcher' }));
    return screen.findByRole('dialog', { name: 'Follow up' });
  };

  it('Follow up opens the follow-up template, filled from the job', async () => {
    const user = userEvent.setup();
    renderApp();
    const dialog = await openFollowUp(user);
    expect(dialog).toHaveTextContent('the UX Researcher role at Bramble & Finch');
    // Its blanks are chips that fill in place (rev-3 A); Edit message opens the whole text.
    expect(within(dialog).getByRole('button', { name: 'Fill Contact' })).toBeInTheDocument();
    // Edit message is the message card's last row, with a pencil, as in Use template.
    const edit = within(dialog).getByRole('button', { name: 'Edit message' });
    expect(within(dialog).getByRole('region', { name: 'Preview' }).contains(edit)).toBe(true);
    expect(edit.querySelector('svg')).not.toBeNull();
    await user.click(edit);
    const message = within(dialog).getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement;
    expect(message.value).toContain('Hi [Contact]');
  });

  it('with no messages yet: an empty message box, and one tap adds the starters and fills it', async () => {
    setOutreachMessages([]);
    const user = userEvent.setup();
    renderApp();
    const dialog = await openFollowUp(user);
    const box = within(dialog).getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement;
    expect(box.value).toBe('');
    await user.click(within(dialog).getByRole('button', { name: 'Add starter messages' }));
    expect(getAllDocuments().some((d) => d.id === 'snippet-tpl-followup')).toBe(true);
    await waitFor(() =>
      expect(dialog).toHaveTextContent('the UX Researcher role at Bramble & Finch'),
    );
    expect(within(dialog).queryByRole('button', { name: 'Add starter messages' })).toBeNull();
  });

  it('Mark as sent takes it off the due list', async () => {
    const user = userEvent.setup();
    renderApp();
    const dialog = await openFollowUp(user);
    await user.click(within(dialog).getByRole('button', { name: 'Copy message' }));
    await user.click(within(dialog).getByRole('button', { name: 'Mark as sent' }));
    await user.click(within(dialog).getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(getAllJobs().find((j) => j.url === UXR)?.followUp).toBeTruthy();
    expect(dueNames()).toEqual(['Design Systems Lead']);
  });

  it('Snooze 3 days moves it off the due list without recording a follow-up', async () => {
    const user = userEvent.setup();
    renderApp();
    const dialog = await openFollowUp(user);
    await user.click(within(dialog).getByRole('button', { name: 'Snooze 3 days' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(getAllJobs().find((j) => j.url === UXR)?.followUp).toBeUndefined();
    expect(dueNames()).toEqual(['Design Systems Lead']);
  });

  it('Snooze says until when, and its Undo puts the follow-up back on the due list', async () => {
    const user = userEvent.setup();
    renderApp();
    const dialog = await openFollowUp(user);
    await user.click(within(dialog).getByRole('button', { name: 'Snooze 3 days' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await screen.findByText(/^Snoozed until /)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() =>
      expect(getAllJobs().find((j) => j.url === UXR)?.snoozeUntil).toBeUndefined(),
    );
    expect(dueNames()).toContain('UX Researcher');
  });

  it('lists the interviews and calls in the next 7 days; Open job opens its page', async () => {
    renderApp();
    const rows = within(region(/^Next 7 days/)).getAllByRole('listitem');
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringMatching(/Interview · Clinical Systems Analyst.*Hiring manager/),
      expect.stringMatching(/Interview · Senior UX Designer.*Final loop/),
    ]);
    await userEvent.click(
      within(rows[0]).getByRole('link', { name: 'Open job: Clinical Systems Analyst' }),
    );
    await waitFor(() =>
      expect(window.location.hash).toBe(
        `#/queue/${jobIdOf('https://meridianoak.example.com/careers/clinical-systems-analyst')}`,
      ),
    );
    // One page since #416: the job opens on its header and Details.
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Clinical Systems Analyst' }),
    ).toBeVisible();
  });

  it('every Follow up and Next 7 days row opens its posting in one tap (Adrian 2026-10-22)', () => {
    renderApp();
    const urlOf = (label: string) => getAllJobs().find((j) => j.label === label)?.url;
    const rows = within(followUps()).getAllByRole('listitem');
    expect(rows.length).toBeGreaterThan(2); // due and waiting rows alike
    for (const r of rows) {
      const title = titleOf(r)!;
      const posting = within(r).getByRole('link', {
        name: new RegExp(`^Open posting for ${title}`),
      });
      expect(posting).toHaveAttribute('href', urlOf(title));
      expect(posting).toHaveAttribute('target', '_blank');
    }
    const event = within(region(/^Next 7 days/)).getAllByRole('listitem')[0];
    expect(
      within(event).getByRole('link', { name: /^Open posting for Clinical Systems Analyst/ }),
    ).toHaveAttribute('href', 'https://meridianoak.example.com/careers/clinical-systems-analyst');
  });

  it('no line in a row holds three or more " · " items (#192)', () => {
    renderApp();
    const lines = [followUps(), region(/^Next 7 days/)].flatMap((r) =>
      [...r.querySelectorAll('li *')]
        .filter((e) => e.children.length === 0)
        .map((e) => e.textContent ?? ''),
    );
    expect(lines.some((l) => l.includes(' · '))).toBe(true);
    expect(lines.filter((l) => itemsInLine(l) > MAX_META_ITEMS)).toEqual([]);
  });
});

describe('empty sections render nothing (#236)', () => {
  it('with jobs but nothing applied or scheduled, neither section shows', () => {
    addJob('https://acme.example/jobs/1', 'Design Engineer');
    renderApp();
    expect(screen.queryByRole('region', { name: /^Follow up/ })).toBeNull();
    expect(screen.queryByRole('region', { name: /^Next 7 days/ })).toBeNull();
    expect(screen.getByRole('region', { name: /^To apply/ })).toBeInTheDocument();
  });

  it('an applied job not yet due shows under Follow up with its date and no action', () => {
    addJob('https://acme.example/jobs/1', 'Design Engineer');
    markAppliedByUrl('https://acme.example/jobs/1', 'Design Engineer');
    renderApp();
    const row = within(followUps()).getByRole('listitem');
    expect(row).toHaveTextContent(/Follow up /);
    expect(within(row).queryByText('Follow-up due')).toBeNull();
    expect(within(row).queryByRole('button')).toBeNull();
    expect(screen.queryByRole('region', { name: /^Next 7 days/ })).toBeNull();
  });
});

describe('a solicitation’s response deadline (#308)', () => {
  const inDays = (n: number) => {
    const d = new Date();
    return ymd(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
  };
  it('a Saved job closing today, tomorrow or within the week is under Next 7 days with its day; day 8 is not (#419)', () => {
    addJobDetailed('https://sam.gov/opp/a/view', { label: 'Bid today', deadline: inDays(0) });
    addJobDetailed('https://sam.gov/opp/b/view', { label: 'Bid tomorrow', deadline: inDays(1) });
    addJobDetailed('https://sam.gov/opp/c/view', { label: 'Bid next week', deadline: inDays(7) });
    renderApp();
    const next = region(/^Next 7 days/);
    const rows = within(next).getAllByRole('listitem');
    expect(rows.map(titleOf)).toEqual([
      'Applications close · Bid today',
      'Applications close · Bid tomorrow',
    ]);
    expect(rows[0]).toHaveTextContent('Today');
    expect(rows[1]).toHaveTextContent('Tomorrow');
    expect(next).not.toHaveTextContent('Bid next week');
    // Shown once: Follow up no longer repeats them.
    expect(screen.queryByRole('region', { name: /^Follow up/ })).toBeNull();
  });

  it('a job gone from its board drops out of Next 7 days', () => {
    addJobDetailed('https://sam.gov/opp/a/view', { label: 'Bid today', deadline: inDays(1) });
    updateJob(getAllJobs()[0].url, { closedAt: new Date().toISOString() });
    renderApp();
    expect(screen.queryByRole('region', { name: /^Next 7 days/ })).toBeNull();
  });
});

describe('first-run gate in the shell', () => {
  it('a first visit (no tracks, no jobs) opens on setup, with sample data on offer', () => {
    window.location.hash = '';
    renderApp();
    expect(screen.getByRole('tab', { selected: true })).toHaveAccessibleName('Today');
    expect(screen.getByRole('heading', { name: 'Set up your board' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try with sample data' })).toBeInTheDocument();
  });

  it('trying the sample from setup lands on the Pipeline, with its follow-ups', async () => {
    window.location.hash = '';
    renderApp();
    await userEvent.click(screen.getByRole('button', { name: 'Try with sample data' }));
    expect(await screen.findByRole('tab', { name: 'Jobs', selected: true })).toBeInTheDocument();
    expect(await screen.findByRole('region', { name: /^Follow up \(/ })).toBeInTheDocument();
  });

  it('picking a track finishes setup and stays on Companies', async () => {
    window.location.hash = '';
    renderApp();
    const lead = screen.getAllByRole('checkbox')[0];
    expect(lead).not.toBeChecked(); // the Suggested pack starts unticked (Adrian 2026-10-22)
    await userEvent.click(lead);
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await userEvent.click(screen.getByRole('button', { name: 'Finish' }));
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Set up your board' })).toBeNull(),
    );
    expect(
      within(screen.getByRole('tablist', { name: 'Sections' })).getByRole('tab', {
        selected: true,
      }),
    ).toHaveAccessibleName('Companies');
    expect(window.location.hash).toBe('#/discover');
  });

  it('Companies needs a track even when there are jobs; the Pipeline never gates', () => {
    addJob('https://acme.example/jobs/1', 'Design Engineer');
    window.location.hash = '#/discover';
    const { unmount } = renderApp();
    expect(screen.getByText('Pick a track to search')).toBeInTheDocument();
    unmount();
    removeJob('https://acme.example/jobs/1');
    window.location.hash = '#/queue';
    renderApp();
    expect(screen.queryByRole('heading', { name: 'Set up your board' })).toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'Pipeline' })).toBeInTheDocument();
  });
});
