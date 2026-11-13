// Apply's Passed view (Adrian 2026-11-13): passed jobs with Delete (to Recently removed, Undo), and
// postings skipped in Find with Save, Undo skip and Delete (hidden, still never back in Find).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@hirobius/design-system';
import PassedList from './PassedList';
import NoticeHost from './NoticeHost';
import { addJob, getAllJobs, removeJob, updateJob, useJobs } from './store';
import { decided, getDecided, mergeDecided, sanitizeDecided } from './decided';
import { decide } from './feed/decided';
import { getTrash, replaceTrash } from './trash';
import { dismissNotice } from './saveNotice';
import { skippedPostings } from './passed';
import { visibleJobs } from './pipelineView';

const JOB = 'https://acme.example/jobs/1';
const POST = 'https://boards.greenhouse.io/zen/jobs/9';

function Harness() {
  const jobs = visibleJobs(useJobs(), { filter: 'passed' });
  return (
    <ToastProvider>
      <PassedList jobs={jobs} onPick={() => {}} />
      <NoticeHost />
    </ToastProvider>
  );
}
const undo = async () => {
  await userEvent.click(await screen.findByRole('button', { name: 'Undo' }));
};

beforeEach(() => {
  localStorage.clear();
  addJob(JOB, 'Acme Designer');
  updateJob(JOB, { archived: true });
  act(() => decide({ title: 'Zen Systems Designer', company: 'Zen', url: POST }, 'skipped'));
});
afterEach(() => {
  cleanup();
  act(() => dismissNotice());
  getAllJobs()
    .slice()
    .forEach((j) => removeJob(j.url));
  replaceTrash([]);
  localStorage.clear();
});

describe('decided keeps what a Skip needs to list it', () => {
  it('stores title, company and an http(s) link; drops a bad link; keeps hidden', () => {
    const [d] = getDecided();
    expect(d).toMatchObject({ verdict: 'skipped', title: 'Zen Systems Designer', url: POST });
    expect(
      sanitizeDecided([
        { fingerprint: 'x', verdict: 'skipped', at: 'a', url: 'javascript:alert(1)', hidden: true },
      ]),
    ).toEqual([{ fingerprint: 'x', verdict: 'skipped', at: 'a', hidden: true }]);
  });

  it('a later hide wins a merge, so a Delete sticks across devices', () => {
    const before = getDecided();
    act(() => void decided.hide(before[0].fingerprint, '2999-01-01T00:00:00Z'));
    const merged = mergeDecided(before, getDecided());
    expect(merged[0].hidden).toBe(true);
    expect(skippedPostings(merged)).toEqual([]);
  });

  it('an old Skip with no data lists as "Skipped posting", with no link and no Save', () => {
    act(() => void decided.set('old-fp', 'skipped', '2000-01-01T00:00:00Z'));
    render(<Harness />);
    const list = screen.getByRole('list', { name: 'Skipped postings' });
    const row = within(list).getByRole('listitem', { name: 'Skipped posting' });
    expect(within(row).queryByRole('link')).toBeNull();
    expect(within(row).queryByRole('button', { name: /^Save/ })).toBeNull();
  });
});

describe('Passed rows', () => {
  it('lists the passed job and the skipped posting with its link', () => {
    render(<Harness />);
    expect(screen.getByRole('link', { name: 'Acme Designer' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Zen Systems Designer/ })).toHaveAttribute(
      'href',
      POST,
    );
    expect(screen.getByText('Zen')).toBeInTheDocument();
  });

  it('Delete on a job sends it to Recently removed, with Undo', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete Acme Designer' }));
    expect(getAllJobs().some((j) => j.url === JOB)).toBe(false);
    expect(getTrash().some((t) => t.job.url === JOB)).toBe(true);
    await undo();
    expect(getAllJobs().some((j) => j.url === JOB)).toBe(true);
  });

  it('Save on a posting saves it as a job; Undo takes it back and skips it again', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Save Zen Systems Designer' }));
    const saved = getAllJobs().find((j) => j.label === 'Zen Systems Designer');
    expect(saved?.company).toBe('Zen');
    expect(getDecided()[0].verdict).toBe('saved');
    expect(skippedPostings(getDecided())).toEqual([]);
    await undo();
    expect(getAllJobs().some((j) => j.label === 'Zen Systems Designer')).toBe(false);
    expect(skippedPostings(getDecided())).toHaveLength(1);
  });

  it('Undo skip puts the posting back in Find; its Undo skips it again', async () => {
    render(<Harness />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Undo skip of Zen Systems Designer' }),
    );
    expect(getDecided()).toEqual([]);
    expect(screen.queryByRole('list', { name: 'Skipped postings' })).toBeNull();
    await undo();
    expect(skippedPostings(getDecided())).toHaveLength(1);
  });

  it('Delete on a posting hides it from Passed but keeps it decided; Undo lists it again', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete Zen Systems Designer' }));
    expect(getDecided()).toHaveLength(1);
    expect(getDecided()[0]).toMatchObject({ verdict: 'skipped', hidden: true });
    expect(decided.has(getDecided()[0].fingerprint)).toBe(true);
    expect(screen.queryByRole('list', { name: 'Skipped postings' })).toBeNull();
    await undo();
    expect(skippedPostings(getDecided())).toHaveLength(1);
  });

  it('with nothing passed, says so', () => {
    act(() => {
      removeJob(JOB);
      localStorage.removeItem('rjb_decided');
    });
    render(
      <ToastProvider>
        <PassedList jobs={[]} onPick={() => {}} />
      </ToastProvider>,
    );
    expect(screen.getByText('Nothing passed yet.')).toBeInTheDocument();
  });
});
