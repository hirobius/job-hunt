// Rapid apply: saves say where they went, the Apply tab walks the list (#471), and a job walks the
// queue with the Application kit. Tested at the route seam through App, by role + name.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { openAllJobs } from './test/allJobs';
import { setTemplatesOpenByDefault } from './templatesOpen';
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
    expect(within(notice).getByText('Saved to Pipeline · To apply')).toBeInTheDocument();
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
    // Empty fields wait behind one "Fill in N more" row.
    await user.click(await screen.findByRole('button', { name: /^Fill in \d+ more/ }));
    // A labelled secondary "Add" (rev-3 mock), named for its field.
    expect(screen.getByRole('button', { name: 'Add Name' })).toHaveTextContent('Add');
    await user.click(screen.getByRole('button', { name: 'Add Name' }));
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Sam Placeholder');
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(getApplyKit().fields.name).toBe('Sam Placeholder');
    await user.click(screen.getByRole('button', { name: 'Copy Name' }));
    expect(writeText).toHaveBeenCalledWith('Sam Placeholder');
    expect(await screen.findByRole('button', { name: 'Copied Name' })).toBeInTheDocument();
  });

  it('Escape cancels a kit field edit: the value stays, focus returns to its button (#312)', async () => {
    const user = userEvent.setup();
    setKitField('name', 'Sam');
    window.location.hash = `#/apply/${jobIdOf(A)}`;
    renderApp();
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
    await user.click(within(region).getByRole('button', { name: 'Undo' }));
    expect(findJobByUrl(C)?.archived).toBe(false);
    // Undo reopens the job set aside, at its place in the list (return paths).
    expect(await screen.findByRole('heading', { name: 'Cask Designer' })).toBeInTheDocument();
    expect(pagerOf().getByText('2 of 3')).toBeInTheDocument();
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
describe("Apply sheet: templates in a job's Apply view (#239)", () => {
  beforeEach(() => {
    setOutreachMessages([
      { id: 'intro', label: 'Cold intro', body: 'Hi, the [Role] role at [Company]. [Your name]' },
      { id: 'thanks', label: 'Thank you', body: 'Thanks, [Contact].', pinned: true },
    ]);
  });
  afterEach(() => setOutreachMessages([]));

  it('lists each template filled for the job, one copy row each', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText');
    setKitField('name', 'Sam Placeholder');
    window.location.hash = `#/apply/${jobIdOf(A)}`;
    renderApp();
    const filled = 'Hi, the Acme Designer role at Acme. Sam Placeholder';
    // Templates, not Documents: the job's own Documents links panel sits on the same view (#471).
    expect(await screen.findByRole('region', { name: 'Templates' })).toBeInTheDocument();
    const list = await screen.findByRole('list', { name: 'Your templates' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows.map((r) => r.getAttribute('aria-label'))).toEqual(['Thank you', 'Cold intro']);
    expect(within(list).getByText(filled)).toBeInTheDocument();
    await user.click(within(list).getByRole('button', { name: 'Copy Cold intro' }));
    expect(writeText).toHaveBeenCalledWith(filled);
    expect(
      await within(list).findByRole('button', { name: 'Copied Cold intro' }),
    ).toBeInTheDocument();
    // Documents remembers the job, so its Back and a Save come back here (return paths).
    expect(screen.getByRole('link', { name: 'Edit documents' })).toHaveAttribute(
      'href',
      `#/apply/${jobIdOf(A)}?documents=`,
    );
    expect(
      screen.getByRole('link', { name: 'Edit documents' }).querySelector('svg'),
    ).not.toBeNull();
  });

  it('a row is its name, a one-line preview, the blanks left and Copy, which copies all of it', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText');
    const long = 'Dear [Company] team, ' + 'I build things that last. '.repeat(20) + 'The end.';
    setOutreachMessages([{ id: 'cover', label: 'Cover letter', body: long }]);
    window.location.hash = `#/apply/${jobIdOf(A)}`;
    renderApp();
    const list = await screen.findByRole('list', { name: 'Your templates' });
    expect(within(list).queryByText(/The end\./)).toBeNull();
    expect(within(list).getByText(/^Dear Acme team, I build things/)).toBeInTheDocument();
    await user.click(within(list).getByRole('button', { name: 'Copy Cover letter' }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('The end.'));
    const row = within(list).getByRole('listitem', { name: 'Cover letter' });
    expect(
      within(row)
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label')),
    ).toEqual(['Open Cover letter', 'Copied Cover letter']);
  });

  it('tapping a row opens the whole filled text: blanks fill in place, Copy, Edit template', async () => {
    const user = userEvent.setup();
    window.location.hash = `#/apply/${jobIdOf(A)}`;
    renderApp();
    const list = await screen.findByRole('list', { name: 'Your templates' });
    const row = within(list).getByRole('listitem', { name: 'Thank you' });
    expect(within(row).getByText('1 blank left')).toBeInTheDocument();
    await user.click(within(list).getByRole('button', { name: 'Open Thank you' }));
    const dialog = await screen.findByRole('dialog', { name: 'Thank you' });
    await user.click(within(dialog).getByRole('button', { name: 'Fill Contact' }));
    await user.type(within(dialog).getByRole('textbox', { name: 'Contact' }), 'Dana');
    await user.click(within(dialog).getByRole('button', { name: 'Fill' }));
    expect(findJobByUrl(A)?.contact).toBe('Dana');
    expect(await within(dialog).findByText(/Thanks, Dana\./)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Copy Thank you' })).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Edit template' })).toHaveAttribute(
      'href',
      expect.stringMatching(/\?documents=/),
    );
  });

  it('Templates is closed by default and stays as left on this device', async () => {
    setTemplatesOpenByDefault(false);
    const user = userEvent.setup();
    window.location.hash = `#/apply/${jobIdOf(A)}`;
    const first = renderApp();
    const toggle = await screen.findByRole('button', { name: 'Templates (2)' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('list', { name: 'Your templates' })).toBeNull();
    await user.click(toggle);
    expect(screen.getByRole('list', { name: 'Your templates' })).toBeInTheDocument();
    first.unmount();
    renderApp();
    expect(await screen.findByRole('list', { name: 'Your templates' })).toBeInTheDocument();
  });

  it('a message with no blanks is a personal note, not a job template', async () => {
    setOutreachMessages([
      { id: 'plan', label: 'Study plan — 80/20', body: 'Read two chapters a day.' },
      { id: 'ty', label: 'Thank you', body: 'Thanks, [Contact].' },
    ]);
    window.location.hash = `#/apply/${jobIdOf(A)}`;
    renderApp();
    const list = await screen.findByRole('list', { name: 'Your templates' });
    expect(within(list).queryByText('Study plan — 80/20')).toBeNull();
    expect(within(list).getByText('Thank you')).toBeInTheDocument();
  });

  it('with no messages, opens a new one in Documents instead', async () => {
    setOutreachMessages([]);
    window.location.hash = `#/apply/${jobIdOf(A)}`;
    renderApp();
    await screen.findByRole('link', { name: 'Open application' });
    expect(screen.queryByRole('list', { name: 'Your templates' })).toBeNull();
    // A new message, remembering the job: saving it comes back here (return paths).
    expect(screen.getByRole('link', { name: 'Write a message' })).toHaveAttribute(
      'href',
      `#/apply/${jobIdOf(A)}?documents=new%2Foutreach`,
    );
  });

  it('with no messages, one tap adds the starters and lists them filled for the job', async () => {
    const user = userEvent.setup();
    setOutreachMessages([]);
    window.location.hash = `#/apply/${jobIdOf(A)}`;
    renderApp();
    const docs = await screen.findByRole('region', { name: 'Templates' });
    await user.click(within(docs).getByRole('button', { name: 'Add starter messages' }));
    const list = await screen.findByRole('list', { name: 'Your templates' });
    expect(within(list).getByRole('listitem', { name: 'Outreach note' })).toHaveTextContent(
      'the Acme Designer opening at Acme',
    );
    expect(within(docs).queryByRole('button', { name: 'Add starter messages' })).toBeNull();
  });

  it('the kit letters with no templates offer the same one-tap add, never an empty picker', async () => {
    const user = userEvent.setup();
    setOutreachMessages([]);
    window.location.hash = `#/apply/${jobIdOf(A)}`;
    renderApp();
    const kit = await screen.findByRole('region', { name: 'Application kit' });
    await user.click(within(kit).getByRole('button', { name: /^Cover note/ }));
    expect(within(kit).queryByRole('combobox', { name: /^Cover note template/ })).toBeNull();
    await user.click(within(kit).getAllByRole('button', { name: 'Add starter messages' })[0]);
    expect(
      await within(kit).findByRole('combobox', { name: /^Cover note template/ }),
    ).toBeInTheDocument();
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
    const kit = await screen.findByRole('region', { name: 'Application kit' });
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
    await screen.findByRole('region', { name: 'Application kit' });
    await waitFor(() => expect(getSnippets().every((s) => s.migrated)).toBe(true));
    expect(getApplyKit().whyTemplate).toBe('why-legacy');
  });
});

describe('the job header keeps to two items per dotted line (#192)', () => {
  it('badges above the title, company on its line, the position in the pager', async () => {
    updateJob(A, { location: 'Remote', verdict: 'match' });
    window.location.hash = `#/apply/${jobIdOf(A)}`;
    renderApp();
    await screen.findByRole('link', { name: 'Open application' });
    const texts = [...document.body.querySelectorAll('*')]
      .filter((e) => e.children.length === 0)
      .map((e) => e.textContent ?? '');
    const header = screen.getByRole('heading', { name: 'Acme Designer' }).closest('header')!;
    expect(header).toHaveTextContent(/Acme\s*·?\s*Remote/);
    expect(texts).toContain('1 of 3');
    // Fit first, then status (#360, as CLAUDE.md says).
    const badges = texts.filter((t) => t === 'Strong fit' || t === 'Saved');
    expect(badges).toEqual(['Strong fit', 'Saved']);
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
    expect(within(notice).getByText('Saved to Pipeline · To apply')).toBeInTheDocument();
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
    expect(within(notice).queryByText('Saved to Pipeline · To apply')).toBeNull();
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

describe('Apply sheet previews keep line breaks', () => {
  afterEach(() => setOutreachMessages([]));
  it('the dialog keeps the greeting on its own line, not run into the next sentence', async () => {
    const user = userEvent.setup();
    setOutreachMessages([{ id: 'ty', label: 'Thanks', body: 'Hi [Contact],\n\nThank you.' }]);
    window.location.hash = `#/apply/${jobIdOf(A)}`;
    renderApp();
    const list = await screen.findByRole('list', { name: 'Your templates' });
    await user.click(within(list).getByRole('button', { name: 'Open Thanks' }));
    const dialog = await screen.findByRole('dialog', { name: 'Thanks' });
    expect(within(dialog).getByText(/Thank you\./).textContent).toMatch(/Contact,\n+Thank you\./);
  });
});

describe('Application kit: where it is kept (sign-in aware)', () => {
  const kitNote = () =>
    within(screen.getByRole('region', { name: /^Application kit/ })).getByText(/^Enter these once/);

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
