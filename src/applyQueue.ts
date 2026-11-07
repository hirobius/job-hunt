// The rapid-apply queue: which saved jobs are waiting to be applied to, in the order the Apply
// tab walks them, and which are waiting on a reply. Pure, so the order is a table-tested rule.
import { deriveJobState } from './jobState';
import { followUpDate } from './jobEvents';
import type { Job } from './types';

/** Not yet applied and not set aside: pinned first, then newest saved (the list is append-only). */
export function toApplyQueue(jobs: Job[]): Job[] {
  const open = jobs
    .map((j, i) => ({ j, i }))
    .filter(({ j }) => !j.archived && deriveJobState(j).status === 'Saved');
  open.sort((a, b) => Number(!!b.j.priority) - Number(!!a.j.priority) || b.i - a.i);
  return open.map(({ j }) => j);
}

/** Applied or interviewing, not set aside: the jobs whose next step is a follow-up, by the day it
 *  falls due (a snooze counts, so the order matches the day the Pipeline shows). */
export function followUpJobs(jobs: Job[], now: Date = new Date()): Job[] {
  const day = (j: Job) => followUpDate(j, now) ?? '';
  return jobs
    .filter((j) => !j.archived && deriveJobState(j, now).followUp.tracked)
    .sort((a, b) => day(a).localeCompare(day(b)));
}
