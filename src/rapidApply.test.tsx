// Rapid apply: saves say where they went and the Apply tab walks the list (#471). The Application
// kit left the job view (2026-11-13). Tested at the route seam through App, by role + name.
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

import { ColorModeProvider } from './ColorMode';
import App from './App';
import { addJob, findJobByUrl, getAllJobs, jobIdOf, removeJob, updateJob } from './store';
import { getApplyKit, replaceApplyKit, emptyKit } from './applyKit';
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
    // Rows are links named by the title alone (#543).
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
    // Acme is applied now, so it leaves To apply (#541): Cask is first of two.
    expect(pagerOf().getByText('1 of 2')).toBeInTheDocument();
    resetAnswerGuard(); // a person reads the next job before answering it
    await user.click(screen.getByRole('button', { name: /^Not a fit/ }));
    expect(findJobByUrl(C)?.archived).toBe(true);
    await waitFor(() => expect(window.location.hash).toBe(`#/apply/${jobIdOf(B)}`));
    expect(pagerOf().getByText('1 of 1')).toBeInTheDocument();
    const region = await findNotice();
    // #536: the toast names the job, and Undo restores it and its place.
    expect(within(region).getByText('Marked not a fit: Cask Designer')).toBeInTheDocument();
    await user.click(within(region).getByRole('button', { name: 'Undo' }));
    // Undo puts every field back and does not navigate (#536): the job is back in its place in
    // the list, and the page stays on the job it moved on to.
    expect(findJobByUrl(C)?.archived).toBeFalsy();
    expect(window.location.hash).toBe(`#/apply/${jobIdOf(B)}`);
    await waitFor(() => expect(pagerOf().getByText('2 of 2')).toBeInTheDocument());
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

  it('after Not a fit on a job opened outside the walk (from Find), focus moves to the next title (#536)', async () => {
    const user = userEvent.setup();
    window.location.hash = `#/apply/${jobIdOf(C)}?from=%2Ffind`;
    renderApp();
    await user.click(await screen.findByRole('button', { name: /^Not a fit/ }));
    const next = await screen.findByRole('heading', { level: 1, name: 'Bolt Designer' });
    await waitFor(() => expect(next).toHaveFocus());
    // It stays in Apply (the next job), and keeps the way back to Find.
    expect(window.location.hash).toBe(`#/apply/${jobIdOf(B)}?from=%2Ffind`);
  });

  it('after Not a fit on the last job, the tab goes back to its list and its heading takes focus (#536)', async () => {
    const user = userEvent.setup();
    removeJob(B);
    removeJob(C);
    updateJob(A, { priority: false });
    window.location.hash = `#/apply/${jobIdOf(A)}`;
    renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Acme Designer' });
    await user.click(screen.getByRole('button', { name: /^Not a fit/ }));
    await waitFor(() => expect(window.location.hash).toBe('#/apply'));
    expect(findJobByUrl(A)?.archived).toBe(true);
    // No next job: the Apply tab is the done state (#554), and its page heading takes focus,
    // never <body>.
    const h1 = await screen.findByRole('heading', { level: 1, name: 'Apply' });
    await waitFor(() => expect(h1).toHaveFocus());
    expect(screen.getByRole('region', { name: 'That is the list' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /^Actions for / })).toBeNull();
  });

  it('after the last job, the tab is the done state (#554), its heading focused', async () => {
    const user = userEvent.setup();
    removeJob(B);
    removeJob(C);
    updateJob(A, { priority: false });
    window.location.hash = `#/apply/${jobIdOf(A)}`;
    renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Acme Designer' });
    await user.click(screen.getByRole('button', { name: /^Mark applied/ }));
    await waitFor(() => expect(window.location.hash).toBe('#/apply'));
    // Nothing left to apply to: the done state, the week's line counts the one just applied to.
    const h1 = await screen.findByRole('heading', { level: 1, name: 'Apply' });
    await waitFor(() => expect(h1).toHaveFocus());
    const done = screen.getByRole('region', { name: 'That is the list' });
    expect(within(done).getByText('You applied to 1 job this week.')).toBeInTheDocument();
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

  it('the job menu reaches every status (list rows carry no menu, #543)', async () => {
    const user = userEvent.setup();
    renderApp();
    const sheet = await openAllJobs();
    expect(within(sheet).queryByRole('button', { name: /^More actions: / })).toBeNull();
    await user.click(within(sheet).getByRole('link', { name: 'Bolt Designer' }));
    await screen.findByRole('heading', { level: 1, name: 'Bolt Designer' });
    await user.click(screen.getByRole('button', { name: /^More actions: Bolt Designer/ }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'Interviewing' }));
    expect(findJobByUrl(B)?.status).toBe('Interviewing');
  });
});

// Adrian 2026-11-13: the Application kit ("Copy into the form") left the job view. Its data
// (rjb_apply_kit, blob v6) stays in storage, sync, Back up and the merge.
describe('no Application kit on the job view', () => {
  it('shows no Copy into the form panel', async () => {
    replaceApplyKit({ ...emptyKit(), fields: { ...emptyKit().fields, name: 'Ada' } });
    window.location.hash = `#/apply/${jobIdOf(A)}`;
    renderApp();
    await screen.findByRole('link', { name: 'Open application' });
    expect(screen.queryByRole('region', { name: /^Copy into the form/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Custom answers/ })).toBeNull();
    expect(getApplyKit().fields.name).toBe('Ada');
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
});
