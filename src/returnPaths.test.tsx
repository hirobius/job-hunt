// Return paths (Adrian 2026-10-22): "whenever someone navigates away with a key action, they should
// be able to get back easily enough / automatically." Tested at the route seam, through App: a page
// opened by a jump names where it came from on its Back and goes there (a pop when that page is
// just behind in history), finishing the key action returns there with a toast that says so, and
// the browser's Back closes a sheet instead of leaving the page.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { openAllJobs } from './test/allJobs';
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
import { addJob, dedupKey, getAllJobs, jobIdOf, removeJob, updateJob } from './store';
import { replaceCurationState } from './curation/curationStore';
import { setOutreachMessages } from './test/outreach';
import { liveness } from './livenessStore';
import { getRoute, subscribeScrollRestore } from './route';
import { getAllDocuments } from './documents';
import { trashJob } from './trash';
import { rememberSignInReturn, returnAfterSignIn, takeSignInReturn } from './account/signInReturn';
import { topTab } from './test/topTabs';

const A = 'https://acme.example/jobs/1';
const B = 'https://acme.example/jobs/2';
const C = 'https://acme.example/jobs/3';
const idA = jobIdOf(A);

const renderApp = () =>
  render(
    <ColorModeProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ColorModeProvider>,
  );
const at = (hash: string) => waitFor(() => expect(window.location.hash).toBe(hash));
const heading = (name: string | RegExp) => screen.findByRole('heading', { level: 1, name });
const notice = () => screen.getByRole('region', { name: /^Notifications/ });

beforeEach(() => {
  h.fake?.reset();
  localStorage.clear();
  window.history.replaceState(null, '', '/');
  window.location.hash = '';
  setOutreachMessages([
    { id: 'intro', label: 'Cold intro', body: 'Hi [Company] team, about the [Role] role.' },
  ]);
  addJob(A, 'Fabricator');
  updateJob(A, { company: 'Acme Metals' });
});
afterEach(() => {
  cleanup();
  getAllJobs()
    .slice()
    .forEach((j) => removeJob(j.url));
  replaceCurationState({ categories: [], groups: [], tiles: [] });
  liveness.set({});
});

describe('a job page goes back to where it was opened from', () => {
  it('a jump from the All jobs list moves in place: no history step (Proposal A)', async () => {
    addJob(B, 'Welder');
    window.location.hash = '#/apply';
    renderApp();
    const sheet = await openAllJobs();
    const length = window.history.length;
    await userEvent.click(within(sheet).getByRole('link', { name: 'Welder' }));
    await at(`#/apply/${jobIdOf(B)}`);
    expect(await heading('Welder')).toBeInTheDocument();
    expect(window.history.length).toBe(length);
  });

  it('from its Company page and back: each Back names the page it returns to', async () => {
    window.location.hash = `#/apply/${idA}`;
    renderApp();
    await userEvent.click(await screen.findByRole('link', { name: 'Acme Metals' }));
    await heading('Acme Metals');
    const back = screen.getByRole('link', { name: 'Back to Fabricator' });
    expect(back).toHaveTextContent(/^Fabricator$/);
    // The job is the page the Company came from: its link goes back without nesting.
    expect(screen.getAllByRole('link', { name: 'Fabricator' })[0]).toHaveAttribute(
      'href',
      `#/apply/${idA}`,
    );
    await userEvent.click(back);
    await at(`#/apply/${idA}`);
    expect(await heading('Fabricator')).toBeInTheDocument();
  });

  it('opened from a Company page, Back returns to the Company', async () => {
    window.location.hash = '#/apply/company/acme-metals';
    renderApp();
    await heading('Acme Metals');
    await userEvent.click(screen.getAllByRole('link', { name: 'Fabricator' })[0]);
    await heading('Fabricator');
    await userEvent.click(screen.getByRole('button', { name: 'Back to Acme Metals' }));
    await at('#/apply/company/acme-metals');
  });

  it('Remove goes back to the origin; Undo reopens the job page', async () => {
    window.location.hash = '#/apply/company/acme-metals';
    renderApp();
    await heading('Acme Metals');
    await userEvent.click(screen.getAllByRole('link', { name: 'Fabricator' })[0]);
    await heading('Fabricator');
    await userEvent.click(screen.getByRole('button', { name: 'More actions: Fabricator' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Remove' }));
    await at('#/apply/company/acme-metals');
    await userEvent.click(within(notice()).getByRole('button', { name: 'Undo' }));
    expect(await heading('Fabricator')).toBeInTheDocument();
    expect(getRoute()).toMatchObject({
      tab: 'apply',
      jobId: idA,
      from: '/apply/company/acme-metals',
    });
  });

  it('retiring a job closed on the board goes back to the tab', async () => {
    liveness.set({ [dedupKey(A)]: { state: 'closed', checkedAt: '2026-10-20T00:00:00Z' } });
    window.location.hash = `#/apply/${idA}`;
    renderApp();
    await heading('Fabricator');
    await userEvent.click(screen.getByRole('button', { name: 'More actions: Fabricator' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Retire' }));
    await at('#/apply');
  });
});

describe("a job's Apply view (#471: the tab is the walk, no Apply mode)", () => {
  beforeEach(() => {
    addJob(B, 'Welder');
    addJob(C, 'Machinist');
  });

  it('the pager moves in place: no history step', async () => {
    window.location.hash = '#/apply';
    renderApp();
    const pager = await screen.findByRole('navigation', { name: 'Jobs in the list' });
    const length = window.history.length;
    const before = window.location.hash;
    const step = within(pager)
      .getAllByRole('button', { name: /^(Next|Previous) page$/ })
      .find((b) => !(b as HTMLButtonElement).disabled)!;
    await userEvent.click(step);
    await waitFor(() => expect(window.location.hash).not.toBe(before));
    expect(window.history.length).toBe(length);
  });

  it('Undo on Not a fit reopens that job', async () => {
    window.location.hash = `#/apply/${jobIdOf(C)}`;
    renderApp();
    await heading('Machinist');
    await userEvent.click(screen.getByRole('button', { name: /^Not a fit/ }));
    await waitFor(() => expect(getRoute().jobId).not.toBe(jobIdOf(C)));
    await userEvent.click(within(notice()).getByRole('button', { name: 'Undo' }));
    await at(`#/apply/${jobIdOf(C)}`);
    expect(await heading('Machinist')).toBeInTheDocument();
  });

  it('a half-typed kit field is still open with its text after Edit documents and Back', async () => {
    window.location.hash = `#/apply/${idA}`;
    renderApp();
    await heading('Fabricator');
    await userEvent.click(await screen.findByRole('button', { name: /^Fill in \d+ more/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Add Name' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'Sam Pla');
    await userEvent.click(screen.getByRole('link', { name: 'Edit documents' }));
    // Documents is a dialog over the job (#471 slice 4): Close returns to it as it was.
    const docs = await screen.findByRole('dialog', { name: 'Documents' });
    await userEvent.click(within(docs).getByRole('button', { name: /Close/ }));
    await at(`#/apply/${idA}`);
    expect(await screen.findByRole('textbox', { name: 'Name' })).toHaveValue('Sam Pla');
    // Cancel closes it, and the next visit starts closed.
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('textbox', { name: 'Name' })).toBeNull();
  });

  it('Edit documents: Documents opens over the job, and saving a message comes straight back', async () => {
    window.location.hash = `#/apply/${jobIdOf(C)}`;
    renderApp();
    await heading('Machinist');
    await userEvent.click(screen.getByRole('link', { name: 'Edit documents' }));
    await screen.findByRole('dialog', { name: 'Documents' });
    await at(`#/apply/${jobIdOf(C)}?documents=`);
    const outreach = screen.getByRole('region', { name: 'Outreach messages' });
    await userEvent.click(within(outreach).getByRole('button', { name: /Cold intro/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Open Cold intro' }));
    // From the library, the editor goes back to the library.
    expect(await screen.findByRole('button', { name: 'All documents' })).toBeVisible();
    const field = screen.getByRole('textbox', { name: 'Message text' });
    await userEvent.type(field, ' Thanks!');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await at(`#/apply/${jobIdOf(C)}`);
    await heading('Machinist');
    const list = await screen.findByRole('list', { name: 'Your templates' });
    expect(within(list).getByText(/Thanks!/)).toBeInTheDocument();
  });
});

describe('pages opened from the Account menu', () => {
  it('Documents opens over a job page; the browser Back closes it on the job', async () => {
    window.location.hash = `#/apply/${idA}`;
    renderApp();
    await heading('Fabricator');
    await userEvent.click(screen.getByRole('button', { name: /^Account/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Documents' }));
    await screen.findByRole('dialog', { name: 'Documents' });
    await at(`#/apply/${idA}?documents=`);
    window.history.back();
    await at(`#/apply/${idA}`);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await heading('Fabricator');
  });

  it('Privacy and terms over the Apply tab closes back there, also after swapping to the Terms', async () => {
    window.location.hash = '#/apply';
    renderApp();
    await heading('Fabricator');
    await userEvent.click(screen.getByRole('button', { name: /^Account/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Privacy and terms' }));
    const legal =
      // Past its loading frame (DialogHold): the dialog with its tabs.
      (await screen.findByRole('tablist', { name: 'Privacy and terms' })).closest(
        '[role="dialog"]',
      ) as HTMLElement;
    const length = window.history.length;
    await userEvent.click(within(legal).getByRole('tab', { name: 'Terms of use' }));
    await at('#/apply?legal=terms');
    expect(window.history.length).toBe(length);
    await userEvent.click(within(legal).getByRole('button', { name: /Close/ }));
    await at('#/apply');
  });
});

describe('the browser Back closes a sheet and stays on the page', () => {
  it('Add job', async () => {
    window.location.hash = '#/apply';
    renderApp();
    await userEvent.click(await screen.findByRole('button', { name: 'Add job' }));
    await screen.findByRole('dialog', { name: 'Add a job' });
    window.history.back();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(window.location.hash).toBe('#/apply');
    expect(screen.getByRole('heading', { level: 1, name: 'Fabricator' })).toBeInTheDocument();
  });

  it('Follow up, over the page it was opened on', async () => {
    updateJob(A, { status: 'Applied', applied: '2026-01-01' });
    window.location.hash = '#/apply';
    renderApp();
    await heading('Fabricator');
    const followUp = await screen.findAllByRole('button', { name: /^Follow up/ });
    await userEvent.click(followUp[0]);
    await screen.findByRole('dialog');
    window.history.back();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(window.location.hash).toBe('#/apply');
  });

  it('the Account menu', async () => {
    window.location.hash = '#/apply';
    renderApp();
    await userEvent.click(await screen.findByRole('button', { name: /^Account/ }));
    await screen.findByRole('menu');
    window.history.back();
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(window.location.hash).toBe('#/apply');
  });

  // Review blockers (2026-10-22): these left the page on Back, the sheet still open over the page
  // behind. Each one starts with a page behind it, so leaving would have somewhere to go.
  async function over(first: string, hash: string) {
    window.location.hash = first;
    renderApp();
    await at(first);
    await new Promise((r) => setTimeout(r, 50));
    window.location.hash = hash;
    await at(hash);
  }
  const closesOnBack = async (sheet: () => HTMLElement | null, hash: string) => {
    await waitFor(() => expect(sheet()).not.toBeNull());
    window.history.back();
    await waitFor(() => expect(sheet()).toBeNull());
    await new Promise((r) => setTimeout(r, 50));
    expect(window.location.hash).toBe(hash);
  };

  it('Sign in, picked from the Account menu, with an email typed', async () => {
    await over('#/find', '#/apply');
    await userEvent.click(await screen.findByRole('button', { name: /^Account/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Sign in to sync…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Sign in' });
    await userEvent.type(within(dialog).getByLabelText('Email'), 'typed@example.com');
    // The Account menu's own entry is popped as it closes; the dialog gets one after that.
    await new Promise((r) => setTimeout(r, 50));
    await closesOnBack(() => screen.queryByRole('dialog', { name: 'Sign in' }), '#/apply');
    // No step left behind by the menu: the next Back leaves the page.
    window.history.back();
    await at('#/find');
  });

  it('Recently removed', async () => {
    addJob(B, 'Welder');
    trashJob(B);
    await over('#/discover/apply', '#/apply');
    // In the Account menu since #416.
    await userEvent.click(await screen.findByRole('button', { name: /^Account/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /^Recently removed/ }));
    await screen.findByRole('dialog', { name: 'Recently removed' });
    await closesOnBack(() => screen.queryByRole('dialog', { name: 'Recently removed' }), '#/apply');
  });

  it('Add interview (#416)', async () => {
    await over('#/discover/apply', `#/apply/${idA}`);
    await heading('Fabricator');
    await userEvent.click(screen.getByRole('button', { name: 'More actions: Fabricator' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Add interview…' }));
    await screen.findByRole('dialog', { name: 'Add interview' });
    await closesOnBack(
      () => screen.queryByRole('dialog', { name: 'Add interview' }),
      `#/apply/${idA}`,
    );
  });

  it("a row's More actions menu", async () => {
    await over('#/discover/apply', '#/apply');
    await userEvent.click(
      (await screen.findAllByRole('button', { name: 'More actions: Fabricator' }))[0],
    );
    await closesOnBack(() => screen.queryByRole('menu'), '#/apply');
  });

  it("Remove from a job page opened on its own: Back doesn't come back to the removed job", async () => {
    await over('#/find', `#/apply/${idA}`);
    await heading('Fabricator');
    await userEvent.click(screen.getByRole('button', { name: 'More actions: Fabricator' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Remove' }));
    await at('#/apply');
    await new Promise((r) => setTimeout(r, 80));
    window.history.back();
    await at('#/find');
  });

  it('closing it on screen leaves no extra step for Back', async () => {
    window.location.hash = '#/apply';
    renderApp();
    const length = window.history.length;
    await userEvent.click(await screen.findByRole('button', { name: 'Add job' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // The sheet's entry was popped: what is ahead of this one is only its forward step.
    await new Promise((r) => setTimeout(r, 30));
    expect(window.history.length).toBe(length + 1);
    expect(window.location.hash).toBe('#/apply');
  });
});

describe('top tabs reopen where they were left', () => {
  it('the open tab, tapped again, goes to its root', async () => {
    window.location.hash = `#/apply/${idA}`;
    renderApp();
    await heading('Fabricator');
    await userEvent.click(topTab('Apply'));
    await at('#/apply');
    // The root of the tab is its first job (Proposal A).
    expect(await heading('Fabricator')).toBeInTheDocument();
  });
});

// Review blockers (2026-10-22): each of these used to navigate twice (a click handler and a
// fallback effect, or a double click, before the first pop landed), landing one page too far back.
// Every test starts with a page in history before the origin, so a second pop has somewhere to go.
describe('one navigation per Remove, Delete or double click', () => {
  const settle = () => new Promise((r) => setTimeout(r, 80));
  /** Start on `first`, then go to `hash` with the app running, so `first` is behind it. */
  async function startAt(first: string, hash: string) {
    window.location.hash = first;
    renderApp();
    await at(first);
    await settle();
    window.location.hash = hash;
    await at(hash);
  }
  // The All jobs sheet's jump: in place (Proposal A).
  const openFromList = async () => {
    const sheet = await openAllJobs();
    await userEvent.click(within(sheet).getAllByRole('link', { name: 'Fabricator' })[0]);
    await heading('Fabricator');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'All jobs' })).toBeNull());
  };
  const remove = async (title: string) => {
    await userEvent.click(screen.getByRole('button', { name: `More actions: ${title}` }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Remove' }));
  };
  /** A double click, both clicks in one tick: before the first one's way back has landed. */
  const doubleClick = (el: HTMLElement) => {
    for (let i = 0; i < 2; i++) {
      fireEvent.pointerDown(el, { button: 0 });
      fireEvent.mouseDown(el, { button: 0 });
      fireEvent.pointerUp(el, { button: 0 });
      fireEvent.mouseUp(el, { button: 0 });
      fireEvent.click(el, { button: 0 });
    }
  };
  /** Lands on `hash` and stays there. */
  const staysAt = async (hash: string) => {
    await at(hash);
    await settle();
    expect(window.location.hash).toBe(hash);
  };
  /** Counts the history traversals the app asks for (jsdom lands two same-tick pops on one
   *  entry, where Chromium overshoots, so the count is what shows a second pop). */
  const countPops = () => {
    const go = vi.spyOn(window.history, 'go');
    const back = vi.spyOn(window.history, 'back');
    let seen = 0;
    return {
      count: () => seen,
      stop: () => {
        // Read before restoring: a restored spy forgets its calls.
        seen = go.mock.calls.length + back.mock.calls.length;
        go.mockRestore();
        back.mockRestore();
      },
    };
  };

  it('Remove on a job opened from its Company page lands on the Company', async () => {
    await startAt('#/apply', '#/apply/company/acme-metals');
    await heading('Acme Metals');
    await userEvent.click(screen.getAllByRole('link', { name: 'Fabricator' })[0]);
    await heading('Fabricator');
    const pops = countPops();
    await remove('Fabricator');
    await staysAt('#/apply/company/acme-metals');
    pops.stop();
    expect(pops.count()).toBe(1);
  });

  it('Remove on a job opened from the Pipeline pops back to the list, its scroll asked back', async () => {
    await startAt('#/discover/apply', '#/apply');
    await openFromList();
    const restored: string[] = [];
    const stop = subscribeScrollRestore((hash) => restored.push(hash));
    await remove('Fabricator');
    await staysAt('#/apply');
    stop();
    expect(restored).toContain('#/apply');
  });

  it('Delete in a document opened from a library that has its own origin goes back to that library', async () => {
    await startAt('#/apply', `#/apply/${idA}`);
    await heading('Fabricator');
    await userEvent.click(screen.getByRole('link', { name: 'Edit documents' }));
    await screen.findByRole('dialog', { name: 'Documents' });
    const library = window.location.hash;
    const outreach = screen.getByRole('region', { name: 'Outreach messages' });
    await userEvent.click(within(outreach).getByRole('button', { name: /Cold intro/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Open Cold intro' }));
    await screen.findByRole('button', { name: 'All documents' });
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    // Delete is soft (#329): no confirm, it goes at once and offers Undo.
    const pops = countPops();
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    await staysAt(library);
    pops.stop();
    expect(pops.count()).toBe(1);
  });

  it('a double click on Back to Find goes back once', async () => {
    await startAt('#/find', `#/apply/${idA}?from=%2Ffind`);
    await heading('Fabricator');
    const pops = countPops();
    doubleClick(screen.getByRole('button', { name: 'Back to Find' }));
    await staysAt('#/find');
    pops.stop();
    expect(pops.count()).toBe(1);
  });

  it('a double tap on the open Pipeline tab goes to its root once', async () => {
    await startAt('#/discover/apply', '#/apply');
    await openFromList();
    const pops = countPops();
    doubleClick(topTab('Apply'));
    await staysAt('#/apply');
    pops.stop();
    // A jump from All jobs replaced the tab's entry (Proposal A), so the root is a swap, not a pop:
    // never two.
    expect(pops.count()).toBeLessThanOrEqual(1);
  });

  it('a double click on Not a fit on the last job to apply to goes back once', async () => {
    await startAt('#/apply', `#/apply/${idA}`);
    await heading('Fabricator');
    const pops = countPops();
    doubleClick(screen.getByRole('button', { name: /^Not a fit/ }));
    await staysAt('#/apply');
    pops.stop();
    expect(pops.count()).toBe(1);
  });

  it('a double click on Save in a new document opened from a job saves one and comes back once', async () => {
    await startAt('#/apply', `#/apply/${idA}`);
    await heading('Fabricator');
    await userEvent.click(screen.getByRole('link', { name: 'Edit documents' }));
    await screen.findByRole('dialog', { name: 'Documents' });
    const before = getAllDocuments().length;
    await userEvent.click(screen.getByRole('button', { name: 'New résumé' }));
    await screen.findByRole('heading', { level: 2, name: 'New résumé' });
    await userEvent.type(screen.getByRole('textbox', { name: 'Text' }), 'Ten years of welding.');
    const pops = countPops();
    doubleClick(screen.getByRole('button', { name: 'Save' }));
    await staysAt(`#/apply/${idA}`);
    pops.stop();
    expect(pops.count()).toBe(1);
    expect(getAllDocuments()).toHaveLength(before + 1);
  });
});

describe('sign-in from a link returns to where it was asked for', () => {
  it('remembers the page, once, and goes there in place', async () => {
    window.location.hash = '#/apply/company/acme-metals';
    await at('#/apply/company/acme-metals');
    rememberSignInReturn();
    window.location.hash = '#/discover';
    await at('#/discover');
    returnAfterSignIn(true);
    expect(window.location.hash).toBe('#/apply/company/acme-metals');
    expect(takeSignInReturn()).toBeNull();
  });

  it('a stale or missing return goes nowhere', () => {
    rememberSignInReturn(Date.now() - 2 * 24 * 60 * 60 * 1000);
    expect(takeSignInReturn()).toBeNull();
    window.location.hash = '#/discover';
    returnAfterSignIn(false);
    expect(takeSignInReturn()).toBeNull();
  });
});
