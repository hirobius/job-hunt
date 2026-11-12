// The To apply view's done state (redesign §5.11, #554): what the week came to, and the next step.
// Pure, so the line and the key are table-tested (applyDone.test.ts).
import { deriveJobState, daysSince } from './jobState';
import type { Job } from './types';

/** Applied in the last 7 days (today and the 6 before it), by the job's applied day. */
export function appliedThisWeek(jobs: Job[], now: Date = new Date()): number {
  return jobs.filter((j) => {
    const d = daysSince(j.applied, now);
    return d !== null && d >= 0 && d < 7;
  }).length;
}

/** Follow-ups due now (the Follow up view's own rule). */
export const followUpsDue = (jobs: Job[], now: Date = new Date()): number =>
  jobs.filter((j) => !j.archived && deriveJobState(j, now).followUp.due).length;

const jobsWord = (n: number) => `${n} ${n === 1 ? 'job' : 'jobs'}`;

/** One line for the week: what was applied to, then what is due. */
export function weekLine(jobs: Job[], now: Date = new Date()): string {
  const applied = appliedThisWeek(jobs, now);
  const due = followUpsDue(jobs, now);
  const first = applied
    ? `You applied to ${jobsWord(applied)} this week.`
    : 'No applications this week yet.';
  if (!due) return first;
  return `${first} ${due === 1 ? '1 follow-up is' : `${due} follow-ups are`} due.`;
}

/** The filled key: follow-ups when some are due, else back to Find for more postings. */
export type NextStep = { kind: 'followUp'; label: string } | { kind: 'find'; label: string };
export function nextStep(jobs: Job[], now: Date = new Date()): NextStep {
  const due = followUpsDue(jobs, now);
  return due
    ? { kind: 'followUp', label: `Follow up (${due})` }
    : { kind: 'find', label: 'Find more jobs' };
}
