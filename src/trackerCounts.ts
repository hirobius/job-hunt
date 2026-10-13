import { daysSince, deriveJobState, FOLLOWUP_DAYS } from './jobState';
import { STATUSES, type Job, type Status } from './types';

export type TrackerFilter = 'active' | 'all' | Status | 'retired';

export function matchesFilter(j: Job, f: TrackerFilter): boolean {
  const s = deriveJobState(j);
  if (f === 'active') return s.isActive;
  if (f === 'all') return true;
  if (f === 'retired') return !!j.archived;
  return !j.archived && s.status === f;
}

export type FilterOption = { value: TrackerFilter; label: string; count: number };

// Filter chips with live counts. Active + All always show; a status (or Retired) shows only when
// at least one job is under it, so the row stays short on phones and every chip is worth tapping.
export function filterOptions(jobs: Job[], current: TrackerFilter): FilterOption[] {
  const count = (f: TrackerFilter) => jobs.filter((j) => matchesFilter(j, f)).length;
  const all: TrackerFilter[] = ['active', 'all', ...STATUSES, 'retired'];
  return all
    .map((value) => ({
      value,
      label:
        value === 'active'
          ? 'Active'
          : value === 'all'
            ? 'All'
            : value === 'retired'
              ? 'Retired'
              : value,
      count: count(value),
    }))
    .filter((o) => o.value === 'active' || o.value === 'all' || o.count > 0 || o.value === current);
}

export type NextUpItem = { job: Job; due: boolean; daysUntil: number };

/** Follow-ups to nudge on top of the list: due first (most overdue first), then soonest upcoming. */
export function nextUpItems(jobs: Job[], now: Date = new Date(), cap = 3): NextUpItem[] {
  const items: NextUpItem[] = [];
  for (const job of jobs) {
    const s = deriveJobState(job, now);
    if (job.archived || !s.followUp.tracked) continue;
    if (s.followUp.due) {
      const age = daysSince(job.followUp || job.applied, now) ?? FOLLOWUP_DAYS;
      items.push({ job, due: true, daysUntil: FOLLOWUP_DAYS - age });
    } else if (s.followUp.daysUntil != null) {
      items.push({ job, due: false, daysUntil: s.followUp.daysUntil });
    }
  }
  return items.sort((a, b) => a.daysUntil - b.daysUntil).slice(0, cap);
}
