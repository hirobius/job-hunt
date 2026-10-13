// Display helpers shared by the Tracker row and the job page.
import { deriveJobState } from './jobState';
import type { Job, Status } from './types';

export const STATUS_TONE: Record<Status, 'warning' | 'info' | 'inProgress' | 'success' | 'danger'> =
  {
    Saved: 'warning',
    Applied: 'info',
    Interviewing: 'inProgress',
    Offer: 'success',
    Rejected: 'danger',
  };

const ago = (d: number) => (d === 0 ? 'today' : `${d}d ago`);

/** Short timing line for the status slot: when it last moved, not the whole history. */
export function timingLabel(j: Job): string {
  const s = deriveJobState(j);
  if (s.followUp.due) return 'Follow-up due';
  if (s.followUp.daysUntil != null) return `Follow up in ${s.followUp.daysUntil}d`;
  if (s.appliedDaysAgo != null) return `Applied ${ago(s.appliedDaysAgo)}`;
  return '';
}
