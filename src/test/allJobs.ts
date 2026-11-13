// Proposal A (Adrian 2026-11-08): on a phone the Apply tab is one job; its list is the All jobs
// sheet. Tests of the list open it first.
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const DONE = 'That is the list';
const viewButton = () => screen.queryByRole('button', { name: /^View: / });
const doneState = () => screen.queryByRole('region', { name: DONE });

/** The walk row's view picker, or the done state (#554: nothing left to apply to), whichever the
 *  Apply tab shows; null when neither comes (no jobs yet: the first-run page). */
async function walkOrDone(timeout = 1000): Promise<'walk' | 'done' | null> {
  return waitFor(
    () => {
      if (viewButton()) return 'walk' as const;
      if (doneState()) return 'done' as const;
      throw new Error('neither the walk nor the done state yet');
    },
    { timeout },
  ).catch(() => null);
}

/** The done state's All jobs: the view switches to All jobs and its first job opens, walk and all. */
async function leaveDone(): Promise<void> {
  await userEvent.click(within(doneState()!).getByRole('button', { name: 'All jobs' }));
  await screen.findByRole('button', { name: /^View: / });
}

/** #542: the walk row's view picker holds "All jobs and filters". */
export async function openAllJobs(): Promise<HTMLElement> {
  if ((await walkOrDone()) === 'done') await leaveDone();
  await userEvent.click(await screen.findByRole('button', { name: /^View: / }));
  await userEvent.click(await screen.findByRole('menuitem', { name: 'All jobs' }));
  return screen.findByRole('dialog', { name: 'All jobs' });
}

/** Below lg only: at lg the list is the column beside the job (JobRail). */
export async function openListOnPhone(): Promise<void> {
  if (window.matchMedia?.('(min-width: 1024px)').matches) return;
  if (!window.location.hash.startsWith('#/apply')) return;
  const shown = await walkOrDone();
  // No jobs yet: the first-run page, no list to open.
  if (!shown) return;
  if (shown === 'done') await leaveDone();
  await userEvent.click(viewButton()!);
  await userEvent.click(await screen.findByRole('menuitem', { name: 'All jobs' }));
  await screen.findByRole('dialog', { name: 'All jobs' });
}
