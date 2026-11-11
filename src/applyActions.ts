// The two answers to a saved job (rapid apply): Mark applied and Not a fit, each with Undo (#212).
// Shared by Apply mode and the job's Apply view (#471), so both say the same words.
import { logFollowUp, restoreFollowUp, setStatus, updateJob } from './store';
import { changeWithUndo, undoPatch } from './jobUndo';
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

/** Set aside as not a fit (retire), at once, with a notice whose Undo puts every field back as
 *  it was (the shared `undoPatch`, as the other Undo paths do). Undo does not navigate: the job
 *  reappears in its place in the list (#536, interaction review 2026-11-11). */
export function setAsideWithUndo(job: Job, verb = 'Marked not a fit'): void {
  const before = { ...job };
  updateJob(job.url, { archived: true });
  // #536: "Marked not a fit: <title> · Undo". The job keeps its record (Closed view).
  showNotice({
    title: `${verb}: ${titleOf(job)}`,
    actions: [{ label: 'Undo', run: () => updateJob(before.url, undoPatch(before)) }],
  });
}

/** Mark followed up (#540): restart the follow-up clock, with Undo putting it back. */
export function markFollowedUpWithUndo(job: Job): void {
  const before = { followUp: job.followUp, snoozeUntil: job.snoozeUntil };
  logFollowUp(job.url);
  showNotice({
    title: `Marked followed up: ${titleOf(job)}`,
    actions: [{ label: 'Undo', run: () => restoreFollowUp(job.url, before) }],
  });
}

/** Close out a job whose follow-up is due (#540): set aside like Not a fit, with Undo. */
export function closeOutWithUndo(job: Job): void {
  setAsideWithUndo(job, 'Closed out');
}
