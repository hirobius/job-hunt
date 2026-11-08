// Calm list 2/7 (#236): Today is gone. Due follow-ups and the next 7 days of interviews and calls
// live at the top of the Apply list, as one Follow up section (due first, then the
// rest with their dates) and one Next 7 days list. `#/find` is home again (#383). Tested at the
// route seam through App and driven by role + name.
import { itemsInLine, MAX_META_ITEMS } from './metaLines';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { openListOnPhone } from './test/allJobs';
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
import { getProfile, replaceProfiles } from './profile';
import { setOutreachMessages } from './test/outreach';
import { currentTab } from './test/topTabs';

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
  replaceProfiles([]);
  window.history.replaceState(null, '', '/');
  window.location.hash = '#/apply';
});
afterEach(() => {
  cleanup();
  getAllJobs()
    .slice()
    .forEach((j) => removeJob(j.url));
  replaceCurationState({ categories: [], groups: [], tiles: [] });
});

describe('#/find is home again (#383; was retired in #236)', () => {
  it('opens Today, not Companies', async () => {
    seedPack('consulting');
    window.location.hash = '#/find';
    renderApp();
    await openListOnPhone();
    expect(currentTab()).toHaveAccessibleName('Find');
    expect(window.location.hash).toBe('#/find');
    expect(screen.getByRole('heading', { level: 1, name: 'Find' })).toBeInTheDocument();
  });

  it('an empty hash lands on Today', async () => {
    seedPack('consulting');
    window.location.hash = '';
    renderApp();
    await openListOnPhone();
    expect(currentTab()).toHaveAccessibleName('Find');
    await waitFor(() => expect(window.location.hash).toBe('#/find'));
  });

  it('a ?add= quick-add link still lands on the Pipeline', async () => {
    window.history.replaceState(null, '', '/?add=https://acme.example/jobs/9');
    renderApp();
    expect(window.location.hash).toBe('#/apply');
    expect(currentTab()).toHaveAccessibleName('Apply');
  });
});

describe('Follow-ups in the Pipeline (#236)', () => {
  beforeEach(() => {
    loadSample();
    // The starter messages are the user's to add (a clean first run): these tests have them.
    setOutreachMessages([...STARTER_SNIPPETS]);
  });

  it('one Follow up section: the due ones first, marked Due, each with its own Follow up', async () => {
    renderApp();
    await openListOnPhone();
    const rows = within(followUps()).getAllByRole('listitem');
    const due = rows.filter((r) => within(r).queryByText('Follow-up due'));
    expect(due.map(titleOf)).toEqual(['Design Systems Designer', 'Design Systems Lead']);
    // The due rows lead the list, and only they carry the action.
    expect(rows.slice(0, 2)).toEqual(due);
    for (const r of due) expect(within(r).getAllByRole('button')).toHaveLength(1);
    for (const r of rows.slice(2)) expect(within(r).queryByRole('button')).toBeNull();
    expect(within(due[0]).getAllByRole('link')[0]).toHaveAttribute(
      'href',
      `#/apply/${jobIdOf('https://brambleandfinch.example.com/jobs/design-systems-designer')}`,
    );
    // No job shows twice in the section.
    const names = rows.map(titleOf);
    expect(new Set(names).size).toBe(names.length);
  });

  const UXR = 'https://brambleandfinch.example.com/jobs/design-systems-designer';
  const dueNames = () =>
    within(followUps())
      .getAllByRole('listitem')
      .filter((r) => within(r).queryByText('Follow-up due'))
      .map(titleOf);
  const openFollowUp = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(
      within(followUps()).getByRole('button', { name: 'Follow up: Design Systems Designer' }),
    );
    return screen.findByRole('dialog', { name: 'Follow up' });
  };

  it('Follow up opens the follow-up template, filled from the job', async () => {
    const user = userEvent.setup();
    renderApp();
    await openListOnPhone();
    const dialog = await openFollowUp(user);
    expect(dialog).toHaveTextContent('the Design Systems Designer role at Bramble & Finch');
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
    await openListOnPhone();
    const dialog = await openFollowUp(user);
    const box = within(dialog).getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement;
    expect(box.value).toBe('');
    await user.click(within(dialog).getByRole('button', { name: 'Add starter messages' }));
    expect(getAllDocuments().some((d) => d.id === 'snippet-tpl-followup')).toBe(true);
    await waitFor(() =>
      expect(dialog).toHaveTextContent('the Design Systems Designer role at Bramble & Finch'),
    );
    expect(within(dialog).queryByRole('button', { name: 'Add starter messages' })).toBeNull();
  });

  it('Mark as sent takes it off the due list', async () => {
    const user = userEvent.setup();
    renderApp();
    await openListOnPhone();
    const dialog = await openFollowUp(user);
    await user.click(within(dialog).getByRole('button', { name: 'Copy message' }));
    await user.click(within(dialog).getByRole('button', { name: 'Mark as sent' }));
    await user.click(within(dialog).getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Follow up' })).toBeNull());
    expect(getAllJobs().find((j) => j.url === UXR)?.followUp).toBeTruthy();
    expect(dueNames()).toEqual(['Design Systems Lead']);
  });

  it('Snooze 3 days moves it off the due list without recording a follow-up', async () => {
    const user = userEvent.setup();
    renderApp();
    await openListOnPhone();
    const dialog = await openFollowUp(user);
    await user.click(within(dialog).getByRole('button', { name: 'Snooze 3 days' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Follow up' })).toBeNull());
    expect(getAllJobs().find((j) => j.url === UXR)?.followUp).toBeUndefined();
    expect(dueNames()).toEqual(['Design Systems Lead']);
  });

  it('Snooze says until when, and its Undo puts the follow-up back on the due list', async () => {
    const user = userEvent.setup();
    renderApp();
    await openListOnPhone();
    const dialog = await openFollowUp(user);
    await user.click(within(dialog).getByRole('button', { name: 'Snooze 3 days' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Follow up' })).toBeNull());
    expect(await screen.findByText(/^Snoozed until /)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() =>
      expect(getAllJobs().find((j) => j.url === UXR)?.snoozeUntil).toBeUndefined(),
    );
    expect(dueNames()).toContain('Design Systems Designer');
  });

  it('lists the interviews and calls in the next 7 days; Open job opens its page', async () => {
    renderApp();
    await openListOnPhone();
    const rows = within(region(/^Next 7 days/)).getAllByRole('listitem');
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringMatching(/Interview · Principal Design Systems Engineer.*Hiring manager/),
      expect.stringMatching(/Interview · Design Systems Architect.*Final loop/),
    ]);
    await userEvent.click(
      within(rows[0]).getByRole('link', { name: 'Open job: Principal Design Systems Engineer' }),
    );
    await waitFor(() =>
      expect(window.location.hash).toBe(
        `#/apply/${jobIdOf('https://meridianoak.example.com/careers/principal-design-systems-engineer')}`,
      ),
    );
    // One page since #416: the job opens on its header and Details.
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Principal Design Systems Engineer' }),
    ).toBeVisible();
  });

  it('every Follow up and Next 7 days row opens its posting in one tap (Adrian 2026-10-22)', async () => {
    renderApp();
    await openListOnPhone();
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
      within(event).getByRole('link', {
        name: /^Open posting for Principal Design Systems Engineer/,
      }),
    ).toHaveAttribute(
      'href',
      'https://meridianoak.example.com/careers/principal-design-systems-engineer',
    );
  });

  it('no line in a row holds three or more " · " items (#192)', async () => {
    renderApp();
    await openListOnPhone();
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
  it('with jobs but nothing applied or scheduled, neither section shows', async () => {
    addJob('https://acme.example/jobs/1', 'Design Engineer');
    renderApp();
    await openListOnPhone();
    expect(screen.queryByRole('region', { name: /^Follow up/ })).toBeNull();
    expect(screen.queryByRole('region', { name: /^Next 7 days/ })).toBeNull();
    expect(screen.getByRole('region', { name: /^Jobs$/ })).toBeInTheDocument();
  });

  it('an applied job not yet due shows under Follow up with its date and no action', async () => {
    addJob('https://acme.example/jobs/1', 'Design Engineer');
    markAppliedByUrl('https://acme.example/jobs/1', 'Design Engineer');
    renderApp();
    await openListOnPhone();
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
  it('a Saved job closing today, tomorrow or within the week is under Next 7 days with its day; day 8 is not (#419)', async () => {
    addJobDetailed('https://sam.gov/opp/a/view', { label: 'Bid today', deadline: inDays(0) });
    addJobDetailed('https://sam.gov/opp/b/view', { label: 'Bid tomorrow', deadline: inDays(1) });
    addJobDetailed('https://sam.gov/opp/c/view', { label: 'Bid next week', deadline: inDays(7) });
    renderApp();
    await openListOnPhone();
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

  it('a job gone from its board drops out of Next 7 days', async () => {
    addJobDetailed('https://sam.gov/opp/a/view', { label: 'Bid today', deadline: inDays(1) });
    updateJob(getAllJobs()[0].url, { closedAt: new Date().toISOString() });
    renderApp();
    await openListOnPhone();
    expect(screen.queryByRole('region', { name: /^Next 7 days/ })).toBeNull();
  });
});

describe('first run in the shell (no setup screen, Adrian 2026-10-29)', () => {
  it('a first visit (no tracks, no jobs) opens on Today with the profile made', async () => {
    window.location.hash = '';
    renderApp();
    await openListOnPhone();
    expect(currentTab()).toHaveAccessibleName('Find');
    await waitFor(() => expect(getProfile()).not.toBeNull());
    expect(screen.queryByText('Set up your search')).toBeNull();
  });

  it('the sample, tried from the Jobs empty state, shows its follow-ups', async () => {
    window.location.hash = '#/apply';
    renderApp();
    await userEvent.click(screen.getByRole('button', { name: 'Try with sample data' }));
    // The tab is now the first job; its list (All jobs) holds the follow-ups (Proposal A).
    await openListOnPhone();
    expect(await screen.findByRole('region', { name: /^Follow up \(/ })).toBeInTheDocument();
  });
});
