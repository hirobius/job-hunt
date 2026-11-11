// The job's keys by state (#540, redesign §5.5 States; interaction review 2026-11-11): exactly one
// filled key in every state that has a next step, then at most one grey key and one exit. Pure, so
// one table-driven test pins every row.
import { httpUrl } from './httpUrl';
import { primaryAction } from './jobRow';
import type { Job } from './types';

export type DockKey =
  | 'openApplication'
  | 'markApplied'
  | 'addLink'
  | 'notAFit'
  | 'copyFollowUp'
  | 'markFollowedUp'
  | 'closeOut'
  | 'addInterview';

export interface DockKeys {
  filled: DockKey;
  grey?: DockKey;
  exit?: DockKey;
}

/** True when the job's link opens a page: a placeholder (`notes:designer`) is no link. */
export const hasApplicationLink = (job: Job): boolean => !!httpUrl(job.url);

export function dockKeysFor(job: Job, now: Date = new Date()): DockKeys | null {
  const next = primaryAction(job, now);
  if (next === 'apply')
    return hasApplicationLink(job)
      ? { filled: 'openApplication', grey: 'markApplied', exit: 'notAFit' }
      : // No link: never Open application (review decision); Add link is the grey key.
        { filled: 'markApplied', grey: 'addLink', exit: 'notAFit' };
  if (next === 'followup')
    return { filled: 'copyFollowUp', grey: 'markFollowedUp', exit: 'closeOut' };
  if (!job.archived && job.status === 'Interviewing') return { filled: 'addInterview' };
  return null;
}
