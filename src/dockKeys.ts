// Which keys a job's action dock holds (#535, #540): one table per job state, so a new state's keys
// are a row here and a key in JobHeader's renderer, never a new dock. Exactly one filled key in
// every state that has keys; a state with no next step has none (no dock, no spacer).
//   to apply, has a link   Open application  | Mark applied | Not a fit
//   to apply, no link      Mark applied      | Add link     | Not a fit
//   follow-up due          Follow up         |              |            (#540 adds the rest)
//   Interviewing           Add interview     |              |
//   anything else          (no dock)
import { primaryAction } from './jobRow';
import { httpUrl } from './httpUrl';
import type { Job } from './types';

/** Every key the dock can hold. #540 adds Mark followed up and Close out here. */
export type DockKeyId =
  'openApplication' | 'markApplied' | 'addLink' | 'notAFit' | 'followUp' | 'addInterview';
/** A key's rank: the filled key, the grey key, the exit (redesign §3). */
export type DockRank = 'primary' | 'secondary' | 'exit';
export interface DockKey {
  id: DockKeyId;
  rank: DockRank;
}

/** The job's application link, when it has one a browser can open (http(s)); else undefined. A
 *  job with no link never shows Open application (no href to a placeholder or an empty URL). */
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
        : [
            { id: 'markApplied', rank: 'primary' },
            { id: 'addLink', rank: 'secondary' },
            { id: 'notAFit', rank: 'exit' },
          ]
      : next === 'followup'
        ? [{ id: 'followUp', rank: 'primary' }]
        : !job.archived && job.status === 'Interviewing'
          ? [{ id: 'addInterview', rank: 'primary' }]
          : [];
  return keys.sort((a, b) => RANK_ORDER[a.rank] - RANK_ORDER[b.rank]);
}
