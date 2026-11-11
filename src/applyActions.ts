// The two answers to a saved job (rapid apply): Mark applied and Not a fit, each with Undo (#212).
// Shared by Apply mode and the job's Apply view (#471), so both say the same words.
import { setStatus, updateJob } from './store';
import { changeWithUndo } from './jobUndo';
import { showNotice } from './saveNotice';
import { titleOf } from './jobRow';
import type { Job } from './types';

/** Mark applied, with a notice whose Undo puts it back. */
export function markAppliedWithUndo(job: Job): void {
  changeWithUndo(
    job,
    'Marked applied · Follow up in 7 days',
    () => setStatus(job.url, 'Applied'),
    null,
  );
}

/** Set aside as not a fit (retire), with a notice whose Undo puts it back in To apply and then
 *  runs `reopen` (the caller shows the job again). */
export function setAsideWithUndo(job: Job, reopen: () => void): void {
  updateJob(job.url, { archived: true });
  // #536: "Marked not a fit: <title> · Undo". The job keeps its record (Closed view).
  showNotice({
    title: `Marked not a fit: ${titleOf(job)}`,
    actions: [
      {
        label: 'Undo',
        run: () => {
          updateJob(job.url, { archived: false });
          reopen();
        },
      },
    ],
  });
}
