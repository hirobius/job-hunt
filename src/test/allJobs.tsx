// The Apply list as tests read it. Below lg the Apply tab is one job (Proposal A) with the view
// picker and the pager: there is no list sheet since 2026-11-17, so a test of the list's rows
// mounts `JobsList` (Add job, the views, the shared full rows) beside the app, in a region named
// "Job list". At lg the list is the column beside the job (JobRail).
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@hirobius/design-system';
import { ColorModeProvider } from '../ColorMode';
import { JobsList } from '../TrackerView';

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

function mountList(): HTMLElement {
  document.querySelector('[aria-label="Job list"]')?.remove();
  const host = document.createElement('section');
  host.setAttribute('role', 'region');
  host.setAttribute('aria-label', 'Job list');
  document.body.appendChild(host);
  render(
    <ColorModeProvider>
      <ToastProvider>
        <JobsList />
      </ToastProvider>
    </ColorModeProvider>,
    { container: host },
  );
  return host;
}

/** Mounts the list region (see the file header). */
export async function openAllJobs(): Promise<HTMLElement> {
  if ((await walkOrDone()) === 'done') await leaveDone();
  return mountList();
}

/** Below lg only: at lg the list is the column beside the job (JobRail). */
export async function openListOnPhone(): Promise<void> {
  if (window.matchMedia?.('(min-width: 1024px)').matches) return;
  if (!window.location.hash.startsWith('#/apply')) return;
  const shown = await walkOrDone();
  // No jobs yet: the first-run page, no list to open.
  if (!shown) return;
  if (shown === 'done') await leaveDone();
  mountList();
}
