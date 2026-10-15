// The Pipeline row model (#129): what one row of the job list offers, shared by the desktop table
// and the phone cards. Pure and DOM-free. A row has at most one primary action; everything else
// goes in its menu. Sortable table columns map onto the existing jobSort keys, so a header click
// and the toolbar's Sort menu are one sort.
import { deriveJobState } from './jobState';
import { SORTS, type SortKey } from './jobSort';
import { prettyTitle } from './store';
import { VERDICTS } from './screening';
import type { Job, Status, Verdict } from './types';

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
export type NextStep = 'apply' | 'followup';

export function primaryAction(job: Job, now: Date = new Date()): NextStep | null {
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

/** How a column header reads under the current sort. */
export function sortDirectionOf(
  column: SortableColumn,
  sort: SortKey,
): 'ascending' | 'descending' | 'none' {
  if (COLUMN_SORT[column] !== sort) return 'none';
  return SORTS.find((s) => s.key === sort)?.direction ?? 'none';
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

/** Everything one Pipeline row shows, worked out once for the table and the cards. */
export interface RowView {
  title: string;
  /** Retired (when it is) · company · location. */
  facts: string;
  /** A retired job's fit drops to neutral, like its status: it no longer competes for attention. */
  verdict:
    | { value: Verdict; label: string; tone: (typeof VERDICTS)[number]['tone'] | 'neutral' }
    | undefined;
  applied: string | null;
  followUp: ReturnType<typeof followUpOf>;
  next: NextStep | null;
  pinned: boolean;
  retired: boolean;
}

export function rowView(job: Job, now: Date = new Date()): RowView {
  const verdict = VERDICTS.find((v) => v.value === job.verdict);
  return {
    title: titleOf(job),
    facts: [job.archived ? 'Retired' : '', job.company, job.location].filter(Boolean).join(' · '),
    verdict: verdict && job.archived ? { ...verdict, tone: 'neutral' } : verdict,
    applied: appliedAgo(job, now),
    followUp: followUpOf(job, now),
    next: primaryAction(job, now),
    pinned: !!job.priority,
    retired: !!job.archived,
  };
}
