// The rapid-apply queue: which saved jobs are waiting to be applied to, in the order Apply mode
// walks them, and which are waiting on a reply. Pure, so the order is a table-tested rule.
import { deriveJobState, FOLLOWUP_DAYS } from './jobState';
import type { Job } from './types';

/** Not yet applied and not set aside: pinned first, then newest saved (the list is append-only). */
export function toApplyQueue(jobs: Job[]): Job[] {
  const open = jobs
    .map((j, i) => ({ j, i }))
    .filter(({ j }) => !j.archived && deriveJobState(j).status === 'Saved');
  open.sort((a, b) => Number(!!b.j.priority) - Number(!!a.j.priority) || b.i - a.i);
  return open.map(({ j }) => j);
}

/** Applied or interviewing, not set aside: the jobs whose next step is a follow-up. */
export function followUpJobs(jobs: Job[], now: Date = new Date()): Job[] {
  return jobs
    .filter((j) => !j.archived && deriveJobState(j, now).followUp.tracked)
    .sort((a, b) => followUpDate(a).localeCompare(followUpDate(b)));
}

/** The local YYYY-MM-DD a job's follow-up falls due (FOLLOWUP_DAYS after the last contact), or ''. */
export function followUpDate(job: Job): string {
  const ref = job.followUp || job.applied;
  const m = ref && /^(\d{4})-(\d{2})-(\d{2})/.exec(ref);
  if (!m) return '';
  const d = new Date(+m[1], +m[2] - 1, +m[3] + FOLLOWUP_DAYS);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
