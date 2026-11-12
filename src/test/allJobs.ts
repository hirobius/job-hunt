// Proposal A (Adrian 2026-11-08): on a phone the Apply tab is one job; its list is the All jobs
// sheet. Tests of the list open it first.
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/** #542: the walk row's view picker holds "All jobs and filters". */
export async function openAllJobs(): Promise<HTMLElement> {
  await userEvent.click(await screen.findByRole('button', { name: /^View: / }));
  await userEvent.click(await screen.findByRole('menuitem', { name: 'All jobs and filters' }));
  return screen.findByRole('dialog', { name: 'All jobs' });
}

/** Below lg only: at lg the list is the column beside the job (JobRail). */
export async function openListOnPhone(): Promise<void> {
  if (window.matchMedia?.('(min-width: 1024px)').matches) return;
  if (!window.location.hash.startsWith('#/apply')) return;
  // No jobs yet: the first-run page, no list to open.
  const button = await screen
    .findByRole('button', { name: /^View: / }, { timeout: 1000 })
    .catch(() => null);
  if (!button) return;
  await userEvent.click(button);
  await userEvent.click(await screen.findByRole('menuitem', { name: 'All jobs and filters' }));
  await screen.findByRole('dialog', { name: 'All jobs' });
}
