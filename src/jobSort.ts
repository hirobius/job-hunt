// Tracker sort order. Pure and DOM-free so it's a deterministic test surface (mirrors
// jobState.ts). Invariants that hold in EVERY sort:
//   • Retired (archived) Jobs always sink to the bottom.
//   • Priority Jobs float to the top of their group.
// And only in the default 'recent' sort: any Job with a DUE follow-up floats to the very
// top of the non-retired set — the "act on these now" view.
import { deriveJobState } from './jobState';
import { STATUSES, type Job } from './types';

export type SortKey = 'recent' | 'followup' | 'applied' | 'status' | 'salary' | 'az';

export const SORTS: { key: SortKey; label: string }[] = [
  { key: 'recent', label: 'Recently added' },
  { key: 'followup', label: 'Follow-up due first' },
  { key: 'applied', label: 'Applied date' },
  { key: 'status', label: 'Status' },
  { key: 'salary', label: 'Salary' },
  { key: 'az', label: 'A–Z' },
];

/** Largest dollar figure found in a free-text salary string, with k/K expanded; NaN if none. */
export function parseSalary(s?: string): number {
  if (!s) return NaN;
  const matches = s.replace(/,/g, '').match(/\d+(?:\.\d+)?\s*[kK]?/g);
  if (!matches) return NaN;
  const nums = matches
    .map((m) => {
      const n = parseFloat(m);
      return isNaN(n) ? NaN : /[kK]/.test(m) ? n * 1000 : n;
    })
    .filter((n) => !isNaN(n));
  return nums.length ? Math.max(...nums) : NaN;
}

/** The per-sort primary metric, ascending (smaller sorts first). Ties fall through to recency. */
function metric(job: Job, key: SortKey, now: Date): number {
  const s = deriveJobState(job, now);
  switch (key) {
    case 'followup':
      // Due first, then soonest due; Jobs not in the follow-up loop sink last.
      return s.followUp.due ? -1 : (s.followUp.daysUntil ?? Infinity);
    case 'applied':
      // Most recently applied first; never-applied last.
      return s.appliedDaysAgo ?? Infinity;
    case 'status':
      return STATUSES.indexOf(s.status);
    case 'salary': {
      // Highest salary first; unparseable/empty last.
      const v = parseSalary(job.salary);
      return isNaN(v) ? Infinity : -v;
    }
    default:
      return 0;
  }
}

/** Return a new array sorted per `key`, honouring the retired/priority/due invariants. */
export function sortJobs(jobs: Job[], key: SortKey, now: Date = new Date()): Job[] {
  return jobs
    .map((j, i) => ({ j, i }))
    .sort((a, b) => {
      // Retired always last.
      const arch = (a.j.archived ? 1 : 0) - (b.j.archived ? 1 : 0);
      if (arch) return arch;

      // Default sort only: due follow-ups float to the top of the non-retired set.
      if (key === 'recent') {
        const dueA = !a.j.archived && deriveJobState(a.j, now).followUp.due ? 0 : 1;
        const dueB = !b.j.archived && deriveJobState(b.j, now).followUp.due ? 0 : 1;
        if (dueA !== dueB) return dueA - dueB;
      }

      // Priority floats within its group.
      const prio = (a.j.priority ? 0 : 1) - (b.j.priority ? 0 : 1);
      if (prio) return prio;

      // Primary metric for the chosen sort.
      if (key === 'az') {
        const az = (a.j.label || '').localeCompare(b.j.label || '', undefined, {
          sensitivity: 'base',
        });
        if (az) return az;
      } else {
        const m = metric(a.j, key, now) - metric(b.j, key, now);
        if (m) return m;
      }

      // Final tie-break: most recently added first (higher insertion index).
      return b.i - a.i;
    })
    .map((x) => x.j);
}
