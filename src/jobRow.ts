// The Pipeline row model (#129): what one row of the job list offers, shared by the desktop table
// and the phone cards. Pure and DOM-free. A row has at most one primary action; everything else
// goes in its menu. Sortable table columns map onto the existing jobSort keys, so a header click
// and the toolbar's Sort menu are one sort.
import { deriveJobState } from './jobState';
import type { SortKey } from './jobSort';
import { prettyTitle } from './store';
import type { Job, Status } from './types';

/** A row's title: the saved label, else one derived from the URL. */
export const titleOf = (job: Job) => job.label || prettyTitle(job.url);

/** Status → HDS Badge tone (the semantic feedback tokens; Interviewing = inProgress). */
export const STATUS_TONE: Record<Status, 'neutral' | 'info' | 'inProgress' | 'success' | 'danger'> =
  {
    Saved: 'neutral',
    Applied: 'info',
    Interviewing: 'inProgress',
    Offer: 'success',
    Rejected: 'danger',
  };

/** The one next step a row offers: apply to a saved job, or log a due follow-up. */
export type PrimaryAction = 'apply' | 'followup';

export function primaryAction(job: Job, now: Date = new Date()): PrimaryAction | null {
  if (job.archived) return null;
  const s = deriveJobState(job, now);
  if (s.isApplyable) return 'apply';
  if (s.followUp.due) return 'followup';
  return null;
}

/** The table's sortable columns and the sort each one applies. */
export const COLUMN_SORT = {
  job: 'az',
  status: 'status',
  fit: 'fit',
  applied: 'applied',
  followup: 'followup',
} as const satisfies Record<string, SortKey>;

export type SortableColumn = keyof typeof COLUMN_SORT;

// The direction each sort runs (jobSort has one per key), for the header's aria-sort.
const DIRECTION: Record<SortKey, 'ascending' | 'descending'> = {
  recent: 'descending',
  az: 'ascending',
  status: 'ascending',
  fit: 'ascending', // best fit first
  applied: 'descending', // most recently applied first
  followup: 'ascending', // soonest due first
  salary: 'descending',
};

/** How a column header reads under the current sort. */
export function sortDirectionOf(
  column: SortableColumn,
  sort: SortKey,
): 'ascending' | 'descending' | 'none' {
  return COLUMN_SORT[column] === sort ? DIRECTION[sort] : 'none';
}

/** A header click sorts by that column; clicking the active one goes back to recently added. */
export function nextSort(column: SortableColumn, sort: SortKey): SortKey {
  return COLUMN_SORT[column] === sort ? 'recent' : COLUMN_SORT[column];
}

/** When the job was applied to, for a row: "Today", "10d ago", or null if it never was. */
export function appliedAgo(job: Job, now: Date = new Date()): string | null {
  const d = deriveJobState(job, now).appliedDaysAgo;
  if (d == null) return null;
  return d <= 0 ? 'Today' : `${d}d ago`;
}

/** The follow-up clock, for a row: due now, due in N days, or null when there is none. */
export function followUpOf(
  job: Job,
  now: Date = new Date(),
): { due: true } | { due: false; inDays: number } | null {
  if (job.archived) return null;
  const f = deriveJobState(job, now).followUp;
  if (f.due) return { due: true };
  return f.daysUntil != null ? { due: false, inDays: f.daysUntil } : null;
}
