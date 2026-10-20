// Rapid apply: saves say where they went, the Pipeline opens on To apply, and Apply mode walks the
// queue with the Application kit. Tested at the route seam through App, by role + name.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@hirobius/design-system';

vi.mock('@supabase/supabase-js', async () => {
  const { createFakeSupabase } = await import('./test/fakeSupabase');
  return { createClient: () => createFakeSupabase().client };
});

import { ColorModeProvider } from './ColorMode';
import App from './App';
import { addJob, findJobByUrl, getAllJobs, jobIdOf, removeJob, updateJob } from './store';
import { getApplyKit, replaceApplyKit, emptyKit, setKitField } from './applyKit';
import { getSnippets, replaceSnippets, type Snippet } from './copyDeckStore';
import { notifySaved, dismissNotice, saveWithNotice } from './saveNotice';
import { itemsInLine, MAX_META_ITEMS } from './metaLines';

const A = 'https://acme.example/jobs/1';
const B = 'https://bolt.example/jobs/2';
const C = 'https://cask.example/jobs/3';

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
    const notice = await screen.findByRole('status', { name: '' });
    expect(within(notice).getByText('Saved to Pipeline · To apply')).toBeInTheDocument();
    await user.click(within(notice).getByRole('button', { name: 'Undo' }));
    expect(findJobByUrl(C)).toBeUndefined();
  });
});

describe('To apply queue and Apply mode', () => {
  it('Pipeline opens on To apply (N) with Start applying, pinned first', async () => {
    const user = userEvent.setup();
    renderApp();
    expect(screen.getByRole('region', { name: 'To apply (3)' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start applying' }));
    expect(window.location.hash).toBe(`#/apply/${jobIdOf(A)}`);
    expect(await screen.findByRole('heading', { name: 'Acme Designer' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open application/ })).toHaveAttribute('href', A);
  });

  it('kit fields are entered once inline and copied with a Copied confirmation', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText');
    window.location.hash = `#/apply/${jobIdOf(A)}`;
    renderApp();
    await user.click(await screen.findByRole('button', { name: 'Add Name' }));
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Sam Placeholder');
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(getApplyKit().fields.name).toBe('Sam Placeholder');
    await user.click(screen.getByRole('button', { name: 'Copy Name' }));
    expect(writeText).toHaveBeenCalledWith('Sam Placeholder');
    expect(await screen.findByRole('button', { name: 'Copied Name' })).toBeInTheDocument();
  });

  it('Mark applied → follow-up date → Next job; Not a fit sets aside with Undo', async () => {
    const user = userEvent.setup();
    window.location.hash = `#/apply/${jobIdOf(A)}`;
    renderApp();
    await user.click(await screen.findByRole('button', { name: 'Mark applied' }));
    expect(findJobByUrl(A)?.status).toBe('Applied');
    expect(screen.getByText(/Follow up on \d{4}-\d{2}-\d{2}/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next job (1 of 2)' }));
    expect(await screen.findByRole('heading', { name: 'Cask Designer' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Not a fit' }));
    expect(findJobByUrl(C)?.archived).toBe(true);
    await waitFor(() => expect(window.location.hash).toBe(`#/apply/${jobIdOf(B)}`));
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(findJobByUrl(C)?.archived).toBe(false);
  });

  it('the row menu reaches every status', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getAllByRole('button', { name: /^More actions: Bolt Designer/ })[0]);
    await user.click(await screen.findByRole('menuitemradio', { name: 'Interviewing' }));
    expect(findJobByUrl(B)?.status).toBe('Interviewing');
  });
});

describe('Apply sheet: templates inside Apply mode (#239)', () => {
  let saved: Snippet[] = [];
  beforeEach(() => {
    saved = getSnippets();
    replaceSnippets([
      { id: 'intro', label: 'Cold intro', body: 'Hi, the [Role] role at [Company]. [Your name]' },
      { id: 'thanks', label: 'Thank you', body: 'Thanks, [Contact].', pinned: true },
    ]);
  });
  afterEach(() => replaceSnippets(saved));

  it('lists each template filled for the job, one copy row each', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText');
    setKitField('name', 'Sam Placeholder');
    window.location.hash = `#/apply/${jobIdOf(A)}`;
    renderApp();
    const filled = 'Hi, the Acme Designer role at Acme. Sam Placeholder';
    const list = await screen.findByRole('list', { name: 'Your templates' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows.map((r) => r.getAttribute('aria-label'))).toEqual(['Thank you', 'Cold intro']);
    expect(within(list).getByText(filled)).toBeInTheDocument();
    await user.click(within(list).getByRole('button', { name: 'Copy Cold intro' }));
    expect(writeText).toHaveBeenCalledWith(filled);
    expect(
      await within(list).findByRole('button', { name: 'Copied Cold intro' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit templates' })).toHaveAttribute(
      'href',
      '#/copy-deck',
    );
    expect(
      screen.getByRole('link', { name: 'Edit templates' }).querySelector('svg'),
    ).not.toBeNull();
  });

  it('a long template shows a short preview with Show all; Copy still copies all of it', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText');
    const long = 'Dear [Company] team, ' + 'I build things that last. '.repeat(20) + 'The end.';
    replaceSnippets([{ id: 'cover', label: 'Cover letter', body: long }]);
    window.location.hash = `#/apply/${jobIdOf(A)}`;
    renderApp();
    const list = await screen.findByRole('list', { name: 'Your templates' });
    expect(within(list).queryByText(/The end\./)).toBeNull();
    expect(within(list).getByText(/^Dear Acme team, I build things/)).toBeInTheDocument();
    await user.click(within(list).getByRole('button', { name: 'Copy Cover letter' }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('The end.'));
    await user.click(within(list).getByRole('button', { name: 'Show all of Cover letter' }));
    expect(within(list).getByText(/The end\./)).toBeInTheDocument();
    await user.click(within(list).getByRole('button', { name: 'Show less of Cover letter' }));
    expect(within(list).queryByText(/The end\./)).toBeNull();
  });

  it('with no templates, points to Templates instead', async () => {
    replaceSnippets([]);
    window.location.hash = `#/apply/${jobIdOf(A)}`;
    renderApp();
    await screen.findByRole('link', { name: 'Open application' });
    expect(screen.queryByRole('list', { name: 'Your templates' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Write a template' })).toHaveAttribute(
      'href',
      '#/copy-deck',
    );
  });
});

describe('Apply mode header keeps to two items per dotted line (#192)', () => {
  it('splits company, stage and position across lines', async () => {
    window.location.hash = `#/apply/${jobIdOf(A)}`;
    renderApp();
    await screen.findByRole('link', { name: 'Open application' });
    const texts = [...document.body.querySelectorAll('*')]
      .filter((e) => e.children.length === 0)
      .map((e) => e.textContent ?? '');
    expect(texts).toContain('Acme · To apply');
    expect(texts).toContain('1 of 3');
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
    const notice = await screen.findByRole('status', { name: '' });
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
    const notice = await screen.findByRole('status', { name: '' });
    expect(within(notice).getByText('Saved to Pipeline · To apply')).toBeInTheDocument();
    await user.click(within(notice).getByRole('button', { name: 'Undo' }));
    expect(findJobByUrl(C)).toMatchObject({ archived: true, notes: 'kept' });
  });

  it('saveWithNotice says nothing for a job that is already in the Pipeline', () => {
    renderApp();
    act(() => {
      expect(saveWithNotice(A)).toBe('exists');
    });
    expect(screen.queryByText('Saved to Pipeline · To apply')).not.toBeInTheDocument();
  });

  it('an unnamed question’s remove button still says what it removes', async () => {
    const user = userEvent.setup();
    window.location.hash = `#/apply/${jobIdOf(A)}`;
    renderApp();
    await user.click(await screen.findByRole('button', { name: 'Add a question' }));
    expect(screen.getByRole('button', { name: 'Remove this question' })).toBeInTheDocument();
  });
});
