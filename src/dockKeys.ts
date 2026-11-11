// Which keys a job's action dock holds (#535, #540; redesign §5.5 States; interaction review
// 2026-11-11): one table per job state, so a new state's keys are a row here and a key in
// JobHeader's renderer, never a new dock. Exactly one filled key in every state that has keys, then
// at most one grey key and one exit; a state with no next step has none (no dock, no spacer).
//   to apply, has a link   Open application  | Mark applied     | Not a fit
//   to apply, no link      Mark applied      | Add link         | Not a fit
//   follow-up due          Copy follow-up    | Mark followed up | Close out
//   Interviewing           Add interview     |                  |
//   anything else          (no dock)
// Pure, so one table-driven test (`dockKeys.test.ts`) pins every row.
import { primaryAction } from './jobRow';
import { httpUrl } from './httpUrl';
import type { Job } from './types';

/** Every key the dock can hold. */
export type DockKeyId =
  | 'openApplication'
  | 'markApplied'
  | 'addLink'
  | 'notAFit'
  | 'copyFollowUp'
  | 'markFollowedUp'
  | 'closeOut'
  | 'addInterview';
/** A key's rank: the filled key, the grey key, the exit (redesign §3). */
export type DockRank = 'primary' | 'secondary' | 'exit';
export interface DockKey {
  id: DockKeyId;
  rank: DockRank;
}

/** The job's application link, when it has one a browser can open (http(s)); else undefined. A
 *  placeholder (`notes:designer`, from a sync or a backup) is no link: such a job never shows Open
 *  application (no href to a placeholder or an empty URL), and its facts say "No application link". */
export const applicationLink = (job: Job): string | undefined => httpUrl(job.url);

const RANK_ORDER: Record<DockRank, number> = { primary: 0, secondary: 1, exit: 2 };

/** The dock's keys for this job, in rank order. */
export function dockKeys(job: Job, now: Date = new Date()): DockKey[] {
  const next = primaryAction(job, now);
  const keys: DockKey[] =
    next === 'apply'
      ? applicationLink(job)
        ? [
            { id: 'openApplication', rank: 'primary' },
            { id: 'markApplied', rank: 'secondary' },
            { id: 'notAFit', rank: 'exit' },
          ]
        : // No link: never Open application (review decision); Add link is the grey key.
          [
            { id: 'markApplied', rank: 'primary' },
            { id: 'addLink', rank: 'secondary' },
            { id: 'notAFit', rank: 'exit' },
          ]
      : next === 'followup'
        ? [
            { id: 'copyFollowUp', rank: 'primary' },
            { id: 'markFollowedUp', rank: 'secondary' },
            { id: 'closeOut', rank: 'exit' },
          ]
        : !job.archived && job.status === 'Interviewing'
          ? [{ id: 'addInterview', rank: 'primary' }]
          : [];
  return keys.sort((a, b) => RANK_ORDER[a.rank] - RANK_ORDER[b.rank]);
}
