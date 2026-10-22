// Rapid apply: saves say where they went, the Pipeline opens on To apply, and Apply mode walks the
// queue with the Application kit. Tested at the route seam through App, by role + name.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
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

import type { createFakeSupabase } from './test/fakeSupabase';
import { loadSupabase } from './supabase';

import { ColorModeProvider } from './ColorMode';
import App from './App';
import { addJob, findJobByUrl, getAllJobs, jobIdOf, removeJob, updateJob } from './store';
import { getApplyKit, replaceApplyKit, emptyKit, setKitField } from './applyKit';
import { setOutreachMessages } from './test/outreach';
import { notifySaved, dismissNotice, saveWithNotice } from './saveNotice';
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

/** Apply mode's pager, looked up fresh (it can re-render as the walk moves on). */
const pagerOf = () => within(screen.getByRole('navigation', { name: 'Jobs to apply' }));

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
  window.location.hash = '#/queue';
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

describe('To apply queue and Apply mode', () => {
  it('Pipeline opens on To apply (N) with Start applying, starred first', async () => {
    const user = userEvent.setup();
    renderApp();
    expect(screen.getByRole('region', { name: 'To apply (3)' })).toBeInTheDocument();
    // Jobs are starred, not pinned (the Star button's word).
    expect(screen.getByText('Starred first, then newest.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start applying' }));
    expect(window.location.hash).toBe(`#/apply/${jobIdOf(A)}`);
    expect(await screen.findByRole('heading', { name: 'Acme Designer' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open application/ })).toHaveAttribute('href', A);
  });

  it('with nothing to apply to, Apply mode points to Companies instead of a dead end', async () => {
    const user = userEvent.setup();
    getAllJobs()
      .slice()
      .forEach((j) => removeJob(j.url));
    window.location.hash = '#/apply/nope';
    renderApp();
    expect(await screen.findByText('To apply is empty')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Find the next company' }));
    expect(window.location.hash).toBe('#/discover');
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

  it('Mark applied → follow-up date → pager Next; Not a fit sets aside with Undo', async () => {
    const user = userEvent.setup();
    window.location.hash = `#/apply/${jobIdOf(A)}`;
    renderApp();
    const pager = await screen.findByRole('navigation', { name: 'Jobs to apply' });
    expect(within(pager).getByText('1 of 3')).toBeInTheDocument();
    expect(within(pager).getByRole('button', { name: 'Previous page' })).toBeDisabled();
    await user.click(await screen.findByRole('button', { name: 'Mark applied' }));
    expect(findJobByUrl(A)?.status).toBe('Applied');
    // rev-3 B: the meta line follows the status: the applied date, not "Saved N days ago".
    expect(screen.getByText(/Applied today/)).toBeInTheDocument();
    expect(screen.queryByText(/Saved (today|\d+ days? ago)/)).toBeNull();
    // A short title, the company in the body, and the date as the Pipeline writes it (no ISO).
    const note = screen.getByText(
      /Follow up on (Today|Tomorrow|[A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2})\./,
    );
    const alert = note.closest('.rjb-inline-alerts') as HTMLElement;
    expect(within(alert).getByText('Applied')).toBeInTheDocument();
    expect(screen.queryByText(/\d{4}-\d{2}-\d{2}/)).toBeNull();
    // The applied job holds its place, so the pager still reads 1 of 3.
    expect(within(pager).getByText('1 of 3')).toBeInTheDocument();
    await user.click(within(pager).getByRole('button', { name: 'Next page' }));
    expect(await screen.findByRole('heading', { name: 'Cask Designer' })).toBeInTheDocument();
    // QA: the job applied to on this walk keeps its place after you move on, so the count holds.
    expect(pagerOf().getByText('2 of 3')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Not a fit' }));
    expect(findJobByUrl(C)?.archived).toBe(true);
    await waitFor(() => expect(window.location.hash).toBe(`#/apply/${jobIdOf(B)}`));
    // The set-aside job leaves the walk; the applied one stays, so the pager never vanishes.
    expect(pagerOf().getByText('2 of 2')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(findJobByUrl(C)?.archived).toBe(false);
    expect(pagerOf().getByText('3 of 3')).toBeInTheDocument();
  });

  it('with one job left the pager still shows, as 1 of 1 with both arrows off (QA)', async () => {
    removeJob(B);
    removeJob(C);
    window.location.hash = `#/apply/${jobIdOf(A)}`;
    renderApp();
    const pager = await screen.findByRole('navigation', { name: 'Jobs to apply' });
    expect(within(pager).getByText('1 of 1')).toBeInTheDocument();
    expect(within(pager).getByRole('button', { name: 'Previous page' })).toBeDisabled();
    expect(within(pager).getByRole('button', { name: 'Next page' })).toBeDisabled();
  });

  it('after Mark applied the meta line gives the applied date, not the saved one (QA, rev-3 B)', async () => {
    const user = userEvent.setup();
    updateJob(A, { history: [{ status: 'Saved', at: '2026-01-05' }] });
    window.location.hash = `#/apply/${jobIdOf(A)}`;
    renderApp();
    const header = (await screen.findByRole('heading', { name: 'Acme Designer' })).closest(
      'header',
    )!;
    expect(header).toHaveTextContent(/Saved \d+ days ago/);
    await user.click(screen.getByRole('button', { name: 'Mark applied' }));
    expect(header).toHaveTextContent('Applied today');
    expect(header).not.toHaveTextContent(/Saved \d+ days ago/);
  });

  it('a double tap on Not a fit sets aside one job, not the next one too', async () => {
    const user = userEvent.setup();
    window.location.hash = `#/apply/${jobIdOf(A)}`;
    renderApp();
    await user.click(await screen.findByRole('button', { name: 'Not a fit' }));
    // The next job renders under the finger; the second tap of the double tap lands on it.
    await screen.findByRole('heading', { name: 'Cask Designer' });
    await user.click(screen.getByRole('button', { name: 'Not a fit' }));
    expect(findJobByUrl(A)?.archived).toBe(true);
    expect(findJobByUrl(C)?.archived).toBeFalsy();
    expect(screen.getByRole('heading', { name: 'Cask Designer' })).toBeInTheDocument();
  });

  it('the row menu reaches every status', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getAllByRole('button', { name: /^More actions: Bolt Designer/ })[0]);
    await user.click(await screen.findByRole('menuitemradio', { name: 'Interviewing' }));
    expect(findJobByUrl(B)?.status).toBe('Interviewing');
  });
});

// The templates are the library's Outreach messages (#227).
describe('Apply sheet: templates inside Apply mode (#239)', () => {
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
    // The panel is named like its Edit documents link (one word for one thing).
    expect(await screen.findByRole('region', { name: 'Documents' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Templates' })).toBeNull();
    const list = await screen.findByRole('list', { name: 'Your templates' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows.map((r) => r.getAttribute('aria-label'))).toEqual(['Thank you', 'Cold intro']);
    expect(within(list).getByText(filled)).toBeInTheDocument();
    await user.click(within(list).getByRole('button', { name: 'Copy Cold intro' }));
    expect(writeText).toHaveBeenCalledWith(filled);
    expect(
      await within(list).findByRole('button', { name: 'Copied Cold intro' }),
    ).toBeInTheDocument();
    // Documents remembers Apply mode, so its Back and a Save come back here (return paths).
    expect(screen.getByRole('link', { name: 'Edit documents' })).toHaveAttribute(
      'href',
      `#/copy-deck?from=%2Fapply%2F${jobIdOf(A)}`,
    );
    expect(
      screen.getByRole('link', { name: 'Edit documents' }).querySelector('svg'),
    ).not.toBeNull();
  });

  it('a long template shows a short preview, Copy is its one action and copies all of it', async () => {
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
    // No chevron: the row has no disclosure, and its one blank (filled here) leaves none open.
    const row = within(list).getByRole('listitem', { name: 'Cover letter' });
    expect(within(row).queryByRole('button', { expanded: false })).toBeNull();
    expect(
      within(row)
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label')),
    ).toEqual(['Copied Cover letter']);
  });

  it('with no messages, opens a new one in Documents instead', async () => {
    setOutreachMessages([]);
    window.location.hash = `#/apply/${jobIdOf(A)}`;
    renderApp();
    await screen.findByRole('link', { name: 'Open application' });
    expect(screen.queryByRole('list', { name: 'Your templates' })).toBeNull();
    // A new message, remembering Apply mode: saving it comes back here (return paths).
    expect(screen.getByRole('link', { name: 'Write a message' })).toHaveAttribute(
      'href',
      `#/copy-deck/new/outreach?from=%2Fapply%2F${jobIdOf(A)}`,
    );
  });
});

describe('Apply mode header keeps to two items per dotted line (#192)', () => {
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
    // The status first, then fit (rev-3 B).
    const badges = texts.filter((t) => t === 'Strong fit' || t === 'Saved');
    expect(badges).toEqual(['Saved', 'Strong fit']);
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

describe('Apply sheet previews keep line breaks', () => {
  afterEach(() => setOutreachMessages([]));
  it('the greeting stays on its own line, not run into the next sentence', async () => {
    setOutreachMessages([{ id: 'ty', label: 'Thanks', body: 'Hi [Contact],\n\nThank you.' }]);
    window.location.hash = `#/apply/${jobIdOf(A)}`;
    renderApp();
    const list = await screen.findByRole('list', { name: 'Your templates' });
    const preview = within(list).getByText(/Thank you\./);
    expect(preview.textContent).toBe('Hi Contact,\nThank you.');
    expect(preview).toHaveClass('rjb-clamp-3');
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
    await waitFor(() =>
      expect(kitNote()).toHaveTextContent('Enter these once. They follow your account.'),
    );
    act(() => void h.fake!.client.auth.signOut());
  });
});
