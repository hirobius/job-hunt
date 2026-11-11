// The save notice goes away once it is stale (QA): its job moved past Saved. It survives
// navigation for its full timeout (#534, interaction review 2026-11-11), so Undo stays in reach.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { dismissNotice, notifySaved, saveWithNotice, showNotice, useNotice } from './saveNotice';
import { addJob, getAllJobs, jobIdOf, removeJob, setStatus } from './store';
import { navigate, openJob } from './route';

const A = 'https://acme.example/jobs/a';
const B = 'https://bolt.example/jobs/b';
const hashSettled = () => act(() => new Promise((r) => setTimeout(r, 0)));
// The notice as a view sees it.
let view: { current: ReturnType<typeof useNotice> };
const getNotice = () => view.current;

beforeEach(async () => {
  window.location.hash = '#/apply';
  await hashSettled();
  addJob(A, 'Acme Designer');
  addJob(B, 'Bolt Designer');
  view = renderHook(() => useNotice()).result;
});
afterEach(() => {
  act(() => dismissNotice());
  getAllJobs()
    .slice()
    .forEach((j) => removeJob(j.url));
});

describe('a stale save notice is dismissed', () => {
  it('when its job moves past Saved', () => {
    act(() => notifySaved([A]));
    act(() => setStatus(A, 'Applied'));
    expect(getNotice()).toBeNull();
  });

  it('a bulk save stays while any of its jobs is still to apply (#219 Undo)', () => {
    act(() => notifySaved([A, B]));
    act(() => setStatus(B, 'Applied'));
    expect(getNotice()).not.toBeNull();
    act(() => setStatus(A, 'Applied'));
    expect(getNotice()).toBeNull();
  });

  it('not when the user navigates: Undo toasts survive navigation (#534)', async () => {
    act(() => notifySaved([A], 'Acme Designer'));
    act(() => navigate({ tab: 'discover', sub: null }, true));
    act(() => openJob(jobIdOf(A)));
    await hashSettled();
    expect(getNotice()?.title).toBe('Added to Apply: Acme Designer');
    expect(getNotice()?.actions.map((a) => a.label)).toEqual(['Open', 'Undo']);
  });

  it('a double Save is a no-op: the link is already in Apply (#534)', async () => {
    const { alreadyInApply } = await import('./saveNotice');
    expect(alreadyInApply(A)).toBe(true);
    expect(alreadyInApply('https://new.example/jobs/x')).toBe(false);
  });

  it('stays while nothing it names changes', async () => {
    act(() => notifySaved([A]));
    act(() => setStatus(B, 'Applied'));
    await hashSettled();
    expect(getNotice()).not.toBeNull();
  });

  it('a Removed notice survives the navigation that follows it', async () => {
    act(() => showNotice({ title: 'Removed', actions: [] }));
    window.location.hash = '#/discover';
    await hashSettled();
    expect(getNotice()).not.toBeNull();
  });
});

// QA (rf-polish): saving a link that is already in the Pipeline closed the dialog (or did nothing
// on a tile or a quick-add link) with no word at all.
describe('saving a job that is already saved', () => {
  it('says so, names the job and offers Open', async () => {
    let out: string | undefined;
    act(() => {
      out = saveWithNotice(A);
    });
    expect(out).toBe('exists');
    const n = getNotice();
    expect(n?.title).toBe('Already in your Pipeline');
    expect(n?.description).toBe('Acme Designer');
    expect(n?.actions.map((a) => a.label)).toEqual(['Open']);
    act(() => n!.actions[0].run());
    await hashSettled();
    expect(window.location.hash).toBe(`#/apply/${jobIdOf(A)}`);
  });

  it('a new link says Added to Apply, with its title (#534)', () => {
    act(() => {
      saveWithNotice('https://cask.example/jobs/c', 'Cask Designer');
    });
    expect(getNotice()?.title).toBe('Added to Apply: Cask Designer');
  });
});
