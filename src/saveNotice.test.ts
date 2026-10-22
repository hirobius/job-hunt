// The save notice goes away once it is stale (QA): its job was opened, its job moved past Saved,
// or the user navigated. Its Open would otherwise point at the page already showing.
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
  window.location.hash = '#/queue';
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
  it('when its job page is opened', async () => {
    act(() => notifySaved([A], 'Acme Designer'));
    expect(getNotice()).not.toBeNull();
    act(() => openJob(jobIdOf(A)));
    await hashSettled();
    expect(getNotice()).toBeNull();
  });

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

  it('when the user navigates (replace too)', async () => {
    act(() => notifySaved([A]));
    act(() => navigate({ tab: 'discover', sub: null }, true));
    expect(getNotice()).toBeNull();
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
    expect(window.location.hash).toBe(`#/queue/${jobIdOf(A)}`);
  });

  it('a new link still says Saved to Pipeline', () => {
    act(() => {
      saveWithNotice('https://cask.example/jobs/c', 'Cask Designer');
    });
    expect(getNotice()?.title).toBe('Saved to Pipeline · To apply');
  });
});
