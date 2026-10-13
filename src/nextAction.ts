// The one next step for a job — the primary button on its Tracker card and job page
// (docs/design/prototype-v1.html, `primaryLabel`). Pure, so the card and the page agree.
import { deriveJobState } from './jobState';
import type { Job } from './types';

export type NextAction = 'apply' | 'followup' | 'interview' | 'reopen';

export const NEXT_ACTION_LABEL: Record<NextAction, string> = {
  apply: 'Mark applied',
  followup: 'Log follow-up',
  interview: 'Add interview',
  reopen: 'Reopen',
};

export function nextAction(job: Job, now: Date = new Date()): NextAction {
  const s = deriveJobState(job, now);
  if (job.archived || s.status === 'Rejected') return 'reopen';
  if (s.status === 'Saved') return 'apply';
  if (s.followUp.due) return 'followup';
  if (s.status === 'Interviewing') return 'interview';
  return 'followup';
}
