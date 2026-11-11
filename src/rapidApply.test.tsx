// Rapid apply: saves say where they went, the Apply tab walks the list (#471), and a job walks the
// queue with the Application kit. Tested at the route seam through App, by role + name.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { openAllJobs } from './test/allJobs';
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

import type { createFakeSupabase } from './test/fakeSupabase';
import { loadSupabase } from './supabase';

import { ColorModeProvider } from './ColorMode';
import App from './App';
import { addJob, findJobByUrl, getAllJobs, jobIdOf, removeJob, updateJob } from './store';
import { getApplyKit, replaceApplyKit, emptyKit, setKitField } from './applyKit';
import { setOutreachMessages } from './test/outreach';
import { getSnippets, replaceSnippets } from './copyDeckStore';
import { addDeviceDataIfAsked } from './test/renderAccount';
import { notifySaved, dismissNotice, saveWithNotice } from './saveNotice';
import { resetAnswerGuard } from './answerGuard';
import { itemsInLine, MAX_META_ITEMS } from './metaLines';

const A = 'https://acme.example/jobs/1';
const B = 'https://bolt.example/jobs/2';
const C = 'https://cask.example/jobs/3';

/** The save notice: an HDS Toast in the Notifications region. */
const findNotice = async () => {
  const region = await screen.findByRole('region', { name: /^Notifications/ });
  await within(region).findByRole('listitem');
  return region;
};

/** The phone's pager, looked up fresh (it can re-render as the walk moves on). */
const pagerOf = () => within(screen.getByRole('navigation', { name: 'Jobs in the list' }));

const renderApp = () =>
  render(
    <ColorModeProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ColorModeProvider>,
  );

beforeEach(() => {
  localStorage.clear();
  replaceApplyKit(emptyKit());
  window.history.replaceState(null, '', '/');
  window.location.hash = '#/apply';
  addJob(A, 'Acme Designer');
  addJob(B, 'Bolt Designer');
  addJob(C, 'Cask Designer');
  updateJob(A, { priority: true, company: 'Acme' });
});
afterEach(() => {
  cleanup();
  act(() => dismissNotice());
  getAllJobs()
    .slice()
    .forEach((j) => removeJob(j.url));
});

describe('save notice', () => {
  it('says where a save went, with Open and Undo', async () => {
    const user = userEvent.setup();
    renderApp();
    act(() => notifySaved([C], 'Cask Designer'));
    const notice = await findNotice();
    expect(within(notice).getByText(/^Added to Apply/)).toBeInTheDocument();
    // rev-3 #s-save-notice: one line, no job name under it (Open is one tap away).
    expect(within(notice).queryByText('Cask Designer')).toBeNull();
    await user.click(within(notice).getByRole('button', { name: 'Undo' }));
    expect(findJobByUrl(C)).toBeUndefined();
  });
});

describe('the Apply tab is the walk (#471: no Apply mode, no Start applying)', () => {
  it('the tab is the first job to apply to (Proposal A); All jobs lists them, starred first', async () => {
    const user = userEvent.setup();
    renderApp();
    // No list page on a phone (Adrian 2026-11-08): the tab opens on the job, starred first.
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Acme Designer' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open application/ })).toHaveAttribute('href', A);
    expect(screen.queryByRole('region', { name: /^To apply/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Start applying|Resume applying/ })).toBeNull();
    const sheet = await openAllJobs();
    const titles = within(sheet)
      .getAllByRole('link', { name: /Designer$/ })
      .map((l) => l.textContent);
    expect(titles[0]).toBe('Acme Designer');
    // A jump opens the job in place and closes the sheet.
    await user.click(within(sheet).getByRole('link', { name: 'Bolt Designer' }));
    await waitFor(() => expect(window.location.hash).toBe(`#/apply/${jobIdOf(B)}`));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Bolt Designer' }),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'All jobs' })).toBeNull());
  });

  it('kit fields are entered once inline and copied with a Copied confirmation', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText');
    window.location.hash = `#/apply/${jobIdOf(A)}`;
    renderApp();
    // Empty fields fold into one line: "11 more fields are empty. Add them" (#539).
    expect(await screen.findByText(/^\d+ more fields are empty\./)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add them' }));
    // A labelled secondary "Add" (rev-3 mock), named for its field.
    expect(screen.getByRole('button', { name: 'Add Name' })).toHaveTextContent('Add');
    await user.click(screen.getByRole('button', { name: 'Add Name' }));
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Sam Placeholder');
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(getApplyKit().fields.name).toBe('Sam Placeholder');
    // A flat chip with a copy icon (#539): a press copies and says "Copied", also to screen readers.
    const chip = screen.getByRole('button', { name: 'Copy Name' });
    expect(chip.querySelector('svg')).not.toBeNull();
    expect(chip).not.toHaveAttribute('data-variant'); // a Tag, not a keycap Button
    await user.click(chip);
    expect(writeText).toHaveBeenCalledWith('Sam Placeholder');
    expect(await screen.findByRole('button', { name: 'Copied Name' })).toHaveTextContent('Copied');
    expect(screen.getAllByRole('status').some((s) => s.textContent === 'Copied Name')).toBe(true);
  });

  it('Escape cancels a kit field edit: the value stays, focus returns to its button (#312)', async () => {
    const user = userEvent.setup();
    setKitField('name', 'Sam');
    window.location.hash = `#/apply/${jobIdOf(A)}`;
    renderApp();
    // Edit opens the field rows (#539); the chips only copy.
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    await user.click(await screen.findByRole('button', { name: 'Edit Name' }));
    await user.type(screen.getByRole('textbox', { name: 'Name' }), ' Typo{Escape}');
    expect(screen.queryByRole('textbox', { name: 'Name' })).toBeNull();
    expect(getApplyKit().fields.name).toBe('Sam');
    expect(screen.getByRole('button', { name: 'Edit Name' })).toHaveFocus();
    // Opened again, the dropped draft is gone.
    await user.click(screen.getByRole('button', { name: 'Edit Name' }));
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Sam');
    // Enter saves and hands focus back the same way, without reopening the field.
    await user.type(screen.getByRole('textbox', { name: 'Name' }), ' Lee{Enter}');
    expect(getApplyKit().fields.name).toBe('Sam Lee');
    expect(screen.queryByRole('textbox', { name: 'Name' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Edit Name' })).toHaveFocus();
  });

  it('Mark applied and Not a fit move on to the next job in the list, each with Undo', async () => {
    const user = userEvent.setup();
    window.location.hash = `#/apply/${jobIdOf(A)}`;
    renderApp();
    // The list as it shows: Acme (starred), then newest first: Cask, Bolt.
    await screen.findByRole('navigation', { name: 'Jobs in the list' });
    expect(pagerOf().getByText('1 of 3')).toBeInTheDocument();
    expect(pagerOf().getByRole('button', { name: 'Previous page' })).toBeDisabled();
    await user.click(await screen.findByRole('button', { name: /^Mark applied/ }));
    expect(findJobByUrl(A)?.status).toBe('Applied');
    // In place: the next job, with no history step.
    await waitFor(() => expect(window.location.hash).toBe(`#/apply/${jobIdOf(C)}`));
    expect(await screen.findByRole('heading', { name: 'Cask Designer' })).toBeInTheDocument();
    // Acme is starred, so it stays in the Active list, and Cask is second.
    expect(pagerOf().getByText('2 of 3')).toBeInTheDocument();
    resetAnswerGuard(); // a person reads the next job before answering it
    await user.click(screen.getByRole('button', { name: /^Not a fit/ }));
    expect(findJobByUrl(C)?.archived).toBe(true);
    await waitFor(() => expect(window.location.hash).toBe(`#/apply/${jobIdOf(B)}`));
    expect(pagerOf().getByText('2 of 2')).toBeInTheDocument();
    const region = await findNotice();
    // #536: the toast names the job, and Undo restores it and its place.
    expect(within(region).getByText('Marked not a fit: Cask Designer')).toBeInTheDocument();
    await user.click(within(region).getByRole('button', { name: 'Undo' }));
    // Undo puts every field back and does not navigate (#536): the job is back in its place in
    // the list, and the page stays on the job it moved on to.
    expect(findJobByUrl(C)?.archived).toBeFalsy();
    expect(window.location.hash).toBe(`#/apply/${jobIdOf(B)}`);
    await waitFor(() => expect(pagerOf().getByText('3 of 3')).toBeInTheDocument());
  });

  it('Mark applied raises a notice with Undo that puts the job back in To apply (#212)', async () => {
    const user = userEvent.setup();
    window.location.hash = `#/apply/${jobIdOf(B)}`;
    renderApp();
    await user.click(await screen.findByRole('button', { name: /^Mark applied/ }));
    expect(findJobByUrl(B)?.status).toBe('Applied');
    const region = await findNotice();
    expect(within(region).getByText(/Marked applied/)).toBeInTheDocument();
    await user.click(within(region).getByRole('button', { name: 'Undo' }));
    expect(findJobByUrl(B)?.status).toBe('Saved');
    expect(findJobByUrl(B)?.applied).toBeFalsy();
  });

  it('a sideways swipe on the job steps the pager, in place (Proposal A)', async () => {
    window.location.hash = `#/apply/${jobIdOf(A)}`;
    renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Acme Designer' });
    const length = window.history.length;
    const swipe = (dx: number, dy = 0) => {
      const h1 = screen.getByRole('heading', { level: 1 });
      fireEvent.touchStart(h1, { touches: [{ clientX: 200, clientY: 300 }] });
      fireEvent.touchEnd(h1, { changedTouches: [{ clientX: 200 + dx, clientY: 300 + dy }] });
    };
    // Mostly up and down: a scroll, not a swipe.
    swipe(-80, 120);
    expect(window.location.hash).toBe(`#/apply/${jobIdOf(A)}`);
    swipe(-100);
    await waitFor(() => expect(window.location.hash).toBe(`#/apply/${jobIdOf(C)}`));
    swipe(100);
    await waitFor(() => expect(window.location.hash).toBe(`#/apply/${jobIdOf(A)}`));
    expect(window.history.length).toBe(length);

    // The page still scrolls up and down; the sideways move is the swipe's (#510 review).
    expect(screen.getByRole('heading', { level: 1 }).closest('.rjb-swipe')).not.toBeNull();
    // A drag that selects text is not a swipe.
    const select = vi.spyOn(window, 'getSelection').mockReturnValue({
      toString: () => 'Acme',
    } as Selection);
    swipe(-100);
    select.mockRestore();
    expect(window.location.hash).toBe(`#/apply/${jobIdOf(A)}`);
    // Nor is one that starts inside something that scrolls sideways (it scrolls itself).
    const h1 = screen.getByRole('heading', { level: 1 });
    const box = h1.parentElement!;
    box.style.overflowX = 'auto';
    Object.defineProperty(box, 'scrollWidth', { configurable: true, value: 900 });
    Object.defineProperty(box, 'clientWidth', { configurable: true, value: 300 });
    swipe(-100);
    expect(window.location.hash).toBe(`#/apply/${jobIdOf(A)}`);
  });

  it('with one job left the pager still shows, as 1 of 1 with both arrows off (QA)', async () => {
    removeJob(B);
    removeJob(C);
    window.location.hash = `#/apply/${jobIdOf(A)}`;
    renderApp();
    const pager = await screen.findByRole('navigation', { name: 'Jobs in the list' });
    expect(within(pager).getByText('1 of 1')).toBeInTheDocument();
    expect(within(pager).getByRole('button', { name: 'Previous page' })).toBeDisabled();
    expect(within(pager).getByRole('button', { name: 'Next page' })).toBeDisabled();
  });

  it('a job the list hides says so, live, and its arrows step to the nearest shown job', async () => {
    updateJob(B, { status: 'Rejected' });
    window.location.hash = `#/apply/${jobIdOf(B)}`;
    renderApp();
    expect(await screen.findByRole('heading', { name: 'Bolt Designer' })).toBeInTheDocument();
    const pager = screen.getByRole('navigation', { name: 'Jobs in the list' });
    // A live region, so a screen reader hears it as it appears (#510 review).
    expect(within(pager).getByRole('status')).toHaveTextContent('Not in this filter');
    // No dead end: an arrow goes to a job the filter shows, in place.
    const length = window.history.length;
    const arrows = within(pager)
      .getAllByRole('button')
      .filter((b) => !(b as HTMLButtonElement).disabled);
    expect(arrows.length).toBeGreaterThan(0);
    fireEvent.click(arrows[0]);
    await waitFor(() =>
      expect([`#/apply/${jobIdOf(A)}`, `#/apply/${jobIdOf(C)}`]).toContain(window.location.hash),
    );
    expect(window.history.length).toBe(length);
  });

  it('a swipe on a job the list hides steps to the nearest shown job', async () => {
    updateJob(B, { status: 'Rejected' });
    window.location.hash = `#/apply/${jobIdOf(B)}`;
    renderApp();
    const h1 = await screen.findByRole('heading', { level: 1, name: 'Bolt Designer' });
    for (const dx of [-100, 100]) {
      fireEvent.touchStart(h1, { touches: [{ clientX: 200, clientY: 300 }] });
      fireEvent.touchEnd(h1, { changedTouches: [{ clientX: 200 + dx, clientY: 300 }] });
    }
    await waitFor(() => expect(window.location.hash).not.toBe(`#/apply/${jobIdOf(B)}`));
  });

  it('a double tap on Mark applied applies to one job, not the next one too', async () => {
    const user = userEvent.setup();
    window.location.hash = `#/apply/${jobIdOf(A)}`;
    renderApp();
    await user.click(await screen.findByRole('button', { name: /^Mark applied/ }));
    // The next job renders under the finger; the second tap of the double tap lands on it.
    await screen.findByRole('heading', { name: 'Cask Designer' });
    await user.click(screen.getByRole('button', { name: /^Mark applied/ }));
    expect(findJobByUrl(A)?.status).toBe('Applied');
    expect(findJobByUrl(C)?.status).toBe('Saved');
    expect(screen.getByRole('heading', { name: 'Cask Designer' })).toBeInTheDocument();
  });

  it('after Mark applied, focus moves to the next job’s heading', async () => {
    const user = userEvent.setup();
    window.location.hash = `#/apply/${jobIdOf(A)}`;
    renderApp();
    await user.click(await screen.findByRole('button', { name: /^Mark applied/ }));
    const next = await screen.findByRole('heading', { level: 1, name: 'Cask Designer' });
    await waitFor(() => expect(next).toHaveFocus());
  });

  it('after Not a fit, focus moves to the next job’s heading', async () => {
    const user = userEvent.setup();
    window.location.hash = `#/apply/${jobIdOf(C)}`;
    renderApp();
    await user.click(await screen.findByRole('button', { name: /^Not a fit/ }));
    const next = await screen.findByRole('heading', { level: 1, name: 'Bolt Designer' });
    await waitFor(() => expect(next).toHaveFocus());
  });

  it('after the last job, the tab goes back to its first job, its heading focused', async () => {
    const user = userEvent.setup();
    removeJob(B);
    removeJob(C);
    updateJob(A, { priority: false });
    window.location.hash = `#/apply/${jobIdOf(A)}`;
    renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Acme Designer' });
    await user.click(screen.getByRole('button', { name: /^Mark applied/ }));
    await waitFor(() => expect(window.location.hash).toBe('#/apply'));
    // Nothing left to apply to: the tab shows the first job there is (Acme, now Applied).
    const h1 = await screen.findByRole('heading', { level: 1, name: 'Acme Designer' });
    await waitFor(() => expect(h1).toHaveFocus());
  });

  it('a double tap on Not a fit sets aside one job, not the next one too', async () => {
    const user = userEvent.setup();
    window.location.hash = `#/apply/${jobIdOf(A)}`;
    renderApp();
    await user.click(await screen.findByRole('button', { name: /^Not a fit/ }));
    // The next job renders under the finger; the second tap of the double tap lands on it.
    await screen.findByRole('heading', { name: 'Cask Designer' });
    await user.click(screen.getByRole('button', { name: /^Not a fit/ }));
    expect(findJobByUrl(A)?.archived).toBe(true);
    expect(findJobByUrl(C)?.archived).toBeFalsy();
    expect(screen.getByRole('heading', { name: 'Cask Designer' })).toBeInTheDocument();
  });

  it('the row menu reaches every status', async () => {
    const user = userEvent.setup();
    renderApp();
    await openAllJobs();
    await user.click(screen.getAllByRole('button', { name: /^More actions: Bolt Designer/ })[0]);
    await user.click(await screen.findByRole('menuitemradio', { name: 'Interviewing' }));
    expect(findJobByUrl(B)?.status).toBe('Interviewing');
  });
});

// The templates are the library's Outreach messages (#227).
describe("a job's messages (#540: sections only with content)", () => {
  beforeEach(() => {
    setOutreachMessages([
      { id: 'intro', label: 'Cold intro', body: 'Hi, the [Role] role at [Company]. [Your name]' },
    ]);
  });
  afterEach(() => setOutreachMessages([]));

  it('has no Templates disclosure; Edit documents opens Documents over the job', async () => {
    window.location.hash = `#/apply/${jobIdOf(A)}`;
    renderApp();
    await screen.findByRole('link', { name: 'Open application' });
    expect(screen.queryByRole('button', { name: /^Templates \(/ })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Templates' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Edit documents' })).toHaveAttribute(
      'href',
      `#/apply/${jobIdOf(A)}?documents=`,
    );
    // With a message, the message rows show.
    expect(screen.getByRole('button', { name: /^Why this company/ })).toBeInTheDocument();
  });

  it('with no messages: no message rows, one tap adds the starters, or write one', async () => {
    const user = userEvent.setup();
    setOutreachMessages([]);
    window.location.hash = `#/apply/${jobIdOf(A)}`;
    renderApp();
    const kit = await screen.findByRole('region', { name: 'Copy into the form' });
    expect(within(kit).queryByRole('button', { name: /^Why this company/ })).toBeNull();
    expect(within(kit).queryByRole('button', { name: /^Cover note/ })).toBeNull();
    expect(within(kit).getByRole('link', { name: 'Write a message' })).toHaveAttribute(
      'href',
      `#/apply/${jobIdOf(A)}?documents=new%2Foutreach`,
    );
    await user.click(within(kit).getByRole('button', { name: 'Add starter messages' }));
    expect(await within(kit).findByRole('button', { name: /^Cover note/ })).toBeInTheDocument();
  });
});

describe('Application kit: a deleted template pick (#314)', () => {
  afterEach(() => setOutreachMessages([]));

  it('delete-then-open-the-job: the pick reads as No template, is cleared, and re-adding the message does not re-link it', async () => {
    const user = userEvent.setup();
    setOutreachMessages([
      { id: 'why-gone', label: 'Why Acme', body: 'Because [Company]' },
      { id: 'other', label: 'Other note', body: 'Other body' },
    ]);
    replaceApplyKit({ ...emptyKit(), whyTemplate: 'why-gone' });
    // The picked message is deleted in Documents; the other message stays.
    setOutreachMessages([{ id: 'other', label: 'Other note', body: 'Other body' }]);
    window.location.hash = `#/apply/${jobIdOf(A)}`;
    renderApp();
    const kit = await screen.findByRole('region', { name: 'Copy into the form' });
    await user.click(within(kit).getByRole('button', { name: /^Why this company/ }));
    const picker = (await within(kit).findByRole('combobox', {
      name: /^Why this company template/,
    })) as HTMLSelectElement;
    expect(picker.value).toBe('');
    // Once sync has settled the stale id is cleared from the kit itself, not just hidden.
    await waitFor(() => expect(getApplyKit().whyTemplate).toBeUndefined());
    // Re-adding a message under the same id must not silently re-link the old pick.
    act(() =>
      setOutreachMessages([
        { id: 'why-gone', label: 'Why Acme', body: 'Because [Company]' },
        { id: 'other', label: 'Other note', body: 'Other body' },
      ]),
    );
    expect(getApplyKit().whyTemplate).toBeUndefined();
    expect(
      (
        within(kit).getByRole('combobox', {
          name: /^Why this company template/,
        }) as HTMLSelectElement
      ).value,
    ).toBe('');
  });
});

describe('Application kit: a pick on a snippet not moved yet (#314 review)', () => {
  afterEach(() => setOutreachMessages([]));

  it('keeps the pick while the snippet waits for its move into the library', async () => {
    // A device that never ran the move: the picked message is still a legacy snippet.
    setOutreachMessages([]);
    replaceSnippets([{ id: 'why-legacy', label: 'Why Acme', body: 'Because [Company]' }]);
    replaceApplyKit({ ...emptyKit(), whyTemplate: 'why-legacy' });
    window.location.hash = `#/apply/${jobIdOf(A)}`;
    renderApp();
    await screen.findByRole('region', { name: 'Copy into the form' });
    await waitFor(() => expect(getSnippets().every((s) => s.migrated)).toBe(true));
    expect(getApplyKit().whyTemplate).toBe('why-legacy');
  });
});

describe('the job header keeps to two items per dotted line (#192)', () => {
  it('title first, company on its line, facts on one line, the position in the pager (#538)', async () => {
    updateJob(A, { location: 'Remote', verdict: 'match' });
    window.location.hash = `#/apply/${jobIdOf(A)}`;
    renderApp();
    await screen.findByRole('link', { name: 'Open application' });
    const texts = [...document.body.querySelectorAll('*')]
      .filter((e) => e.children.length === 0)
      .map((e) => e.textContent ?? '');
    const header = screen.getByRole('heading', { name: 'Acme Designer' }).closest('header')!;
    // Title, then the company, then one facts line (place, pay, date).
    const h1 = screen.getByRole('heading', { name: 'Acme Designer' });
    expect(header.textContent!.indexOf('Acme Designer')).toBeLessThan(
      header.textContent!.indexOf('Remote'),
    );
    expect(h1.compareDocumentPosition(within(header).getByText('Remote')) & 4).toBeTruthy();
    expect(texts).toContain('1 of 3');
    // No fit chip and no Saved chip (#538).
    const badges = texts.filter((t) => t === 'Strong fit' || t === 'Saved');
    expect(badges).toEqual([]);
    expect(texts.filter((t) => itemsInLine(t) > MAX_META_ITEMS)).toEqual([]);
  });
});

// #219: follow-ups from the rapid apply review.
describe('rapid apply follow-ups (#219)', () => {
  it('Undo on a bulk save keeps any job applied to since', async () => {
    const user = userEvent.setup();
    renderApp();
    act(() => notifySaved([B, C]));
    updateJob(B, { status: 'Applied' });
    const notice = await findNotice();
    await user.click(within(notice).getByRole('button', { name: 'Undo' }));
    expect(findJobByUrl(B)?.status).toBe('Applied');
    expect(findJobByUrl(C)).toBeUndefined();
  });

  it('saving a set-aside job brings it back with the notice, and Undo sets it aside again', async () => {
    const user = userEvent.setup();
    updateJob(C, { archived: true, notes: 'kept' });
    renderApp();
    act(() => {
      expect(saveWithNotice(C, 'Cask Designer')).toBe('restored');
    });
    expect(findJobByUrl(C)?.archived).toBe(false);
    const notice = await findNotice();
    expect(within(notice).getByText(/^Added to Apply/)).toBeInTheDocument();
    await user.click(within(notice).getByRole('button', { name: 'Undo' }));
    expect(findJobByUrl(C)).toMatchObject({ archived: true, notes: 'kept' });
  });

  it('saveWithNotice says a job is already in the Pipeline, not that it saved it (QA)', async () => {
    renderApp();
    act(() => {
      expect(saveWithNotice(A)).toBe('exists');
    });
    const notice = await findNotice();
    expect(within(notice).getByText('Already in your Pipeline')).toBeInTheDocument();
    expect(within(notice).getByText('Acme Designer')).toBeInTheDocument();
    expect(within(notice).getByRole('button', { name: 'Open' })).toBeInTheDocument();
    expect(within(notice).queryByText(/^Added to Apply/)).toBeNull();
  });

  it('an unnamed question’s remove button still says what it removes', async () => {
    const user = userEvent.setup();
    window.location.hash = `#/apply/${jobIdOf(A)}`;
    renderApp();
    await user.click(await screen.findByRole('button', { name: /^Custom answers/ }));
    await user.click(screen.getByRole('button', { name: 'Add a question' }));
    expect(screen.getByRole('button', { name: 'Remove this question' })).toBeInTheDocument();
  });
});

describe('Custom answers: Remove is soft (#212)', () => {
  it('removing a question offers Undo, which puts it back in its place', async () => {
    const user = userEvent.setup();
    replaceApplyKit({
      ...emptyKit(),
      answers: [
        { id: 'qa-1', q: 'Visa?', a: 'No sponsorship needed' },
        { id: 'qa-2', q: 'Relocate?', a: 'Yes' },
      ],
    });
    window.location.hash = `#/apply/${jobIdOf(A)}`;
    renderApp();
    await user.click(await screen.findByRole('button', { name: /^Custom answers/ }));
    await user.click(screen.getByRole('button', { name: 'Remove question Visa?' }));
    await waitFor(() => expect(getApplyKit().answers.map((a) => a.id)).toEqual(['qa-2']));
    const region = await findNotice();
    expect(within(region).getByText(/Visa\?/)).toBeInTheDocument();
    await user.click(within(region).getByRole('button', { name: 'Undo' }));
    expect(getApplyKit().answers.map((a) => a.id)).toEqual(['qa-1', 'qa-2']);
    expect(getApplyKit().answers[0].a).toBe('No sponsorship needed');
  });
});

describe('Application kit: where it is kept (sign-in aware)', () => {
  const kitNote = () =>
    within(screen.getByRole('region', { name: /^Copy into the form/ })).getByText(
      /^Enter these once/,
    );

  it('signed out, it says the kit stays on this device', async () => {
    window.location.hash = `#/apply/${jobIdOf(A)}`;
    renderApp();
    await screen.findByRole('heading', { name: 'Acme Designer' });
    expect(kitNote()).toHaveTextContent('Enter these once. Saved on this device only.');
  });

  it('signed in, it says the kit follows the account', async () => {
    await loadSupabase();
    window.location.hash = `#/apply/${jobIdOf(A)}`;
    renderApp();
    act(() => h.fake!.signIn('u1'));
    await addDeviceDataIfAsked();
    await waitFor(() =>
      expect(kitNote()).toHaveTextContent('Enter these once. They follow your account.'),
    );
    act(() => void h.fake!.client.auth.signOut());
  });
});
