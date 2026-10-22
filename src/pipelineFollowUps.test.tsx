// Calm list 2/7 (#236): Today is gone. Due follow-ups and the next 7 days of interviews and calls
// live at the top of the Pipeline, under To apply, as one Follow up section (due first, then the
// rest with their dates) and one Next 7 days list. `#/today` redirects to Companies. Tested at the
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
import { addJob, getAllJobs, jobIdOf, markAppliedByUrl, removeJob } from './store';
import { loadSample } from './demo/loadSample';
import { replaceCurationState } from './curation/curationStore';
import { seedPack } from './curation/starterPacks';

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

describe('#/today is retired (#236)', () => {
  it('redirects to Companies, replacing the history entry', async () => {
    seedPack('consulting');
    window.location.hash = '#/today';
    const before = window.history.length;
    const replace = vi.spyOn(window.history, 'replaceState');
    renderApp();
    await waitFor(() => expect(window.location.hash).toBe('#/discover'));
    expect(replace).toHaveBeenCalled();
    expect(window.history.length).toBe(before);
    expect(screen.getByRole('tab', { selected: true })).toHaveAccessibleName('Companies');
    expect(screen.queryByRole('heading', { level: 2, name: 'Today' })).toBeNull();
    replace.mockRestore();
  });

  it('an empty hash lands on Companies', async () => {
    seedPack('consulting');
    window.location.hash = '';
    renderApp();
    expect(screen.getByRole('tab', { selected: true })).toHaveAccessibleName('Companies');
    await waitFor(() => expect(window.location.hash).toBe('#/discover'));
  });

  it('a ?add= quick-add link still lands on the Pipeline', () => {
    window.history.replaceState(null, '', '/?add=https://acme.example/jobs/9');
    renderApp();
    expect(window.location.hash).toBe('#/queue');
    expect(screen.getByRole('tab', { selected: true })).toHaveAccessibleName('Pipeline');
  });
});

describe('Follow-ups in the Pipeline (#236)', () => {
  beforeEach(() => {
    loadSample();
  });

  it('one Follow up section: the due ones first, marked Due, each with its own Follow up', () => {
    renderApp();
    const rows = within(followUps()).getAllByRole('listitem');
    const due = rows.filter((r) => within(r).queryByText('Due'));
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
      .filter((r) => within(r).queryByText('Due'))
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
    await user.click(within(dialog).getByRole('button', { name: 'Edit message' }));
    const message = within(dialog).getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement;
    expect(message.value).toContain('Hi [Contact]');
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

  it('lists the interviews and calls in the next 7 days; Open job goes to its page', async () => {
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
    expect(within(row).queryByText('Due')).toBeNull();
    expect(within(row).queryByRole('button')).toBeNull();
    expect(screen.queryByRole('region', { name: /^Next 7 days/ })).toBeNull();
  });
});

describe('first-run gate in the shell', () => {
  it('a first visit (no tracks, no jobs) opens on setup, with sample data on offer', () => {
    window.location.hash = '';
    renderApp();
    expect(screen.getByRole('tab', { selected: true })).toHaveAccessibleName('Companies');
    expect(screen.getByRole('heading', { name: 'Set up your board' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try with sample data' })).toBeInTheDocument();
  });

  it('trying the sample from setup lands on the Pipeline, with its follow-ups', async () => {
    window.location.hash = '';
    renderApp();
    await userEvent.click(screen.getByRole('button', { name: 'Try with sample data' }));
    expect(
      await screen.findByRole('tab', { name: 'Pipeline', selected: true }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('region', { name: /^Follow up \(/ })).toBeInTheDocument();
  });

  it('picking a track finishes setup and stays on Companies', async () => {
    window.location.hash = '';
    renderApp();
    expect(screen.getAllByRole('checkbox')[0]).toBeChecked(); // the Suggested pack starts ticked
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

// The "Getting started" card (#132) moved from Today to the Pipeline (#236). Ticks come from real
// state; Dismiss is remembered per device (rjb_ui_getting_started_done).
describe('Getting started card on the Pipeline', () => {
  const card = () => screen.queryByRole('region', { name: 'Getting started' });
  // Display-only rows (rev-3): no disabled checkbox (its opacity failed AA); each row says
  // "done" / "not done" to assistive tech in a list named by the panel.
  const ticks = () => {
    expect(within(card()!).queryByRole('checkbox')).toBeNull();
    return within(within(card()!).getByRole('list', { name: 'Getting started steps' }))
      .getAllByRole('listitem')
      .map((li) => [li.textContent, !/not done/.test(li.textContent ?? '')]);
  };

  it('is not shown before there is a job of your own, nor for sample data alone', () => {
    seedPack('consulting');
    const { unmount } = renderApp();
    expect(card()).toBeNull();
    unmount();
    loadSample();
    renderApp();
    expect(card()).toBeNull();
  });

  it('after the first job it lists three steps and ticks the ones that are true', () => {
    addJob('https://acme.example/jobs/1', 'Design Engineer');
    renderApp();
    expect(ticks()).toEqual([
      [expect.stringMatching(/Save a job/), true],
      [expect.stringMatching(/Log a follow-up or mark a job applied/), false],
      [expect.stringMatching(/Sign in to sync/), false],
    ]);
  });

  it('Dismiss hides it and it stays gone', async () => {
    addJob('https://acme.example/jobs/1', 'Design Engineer');
    const { unmount } = renderApp();
    await userEvent.click(within(card()!).getByRole('button', { name: 'Dismiss' }));
    expect(card()).toBeNull();
    expect(localStorage.getItem('rjb_ui_getting_started_done')).toBe('1');
    unmount();
    renderApp();
    expect(card()).toBeNull();
  });
});
