// Job lifecycle — the model owning a Job's Status transitions and its follow-up
// clock. Pure and DOM-free: read-side derivations for the UI (deriveJobState) and
// write-side transitions (applyStatus, logFollowUp). The store delegates here for
// the rules and keeps persistence; the view reads `deriveJobState` instead of
// recomputing the rules per render. `now` is injected (defaulted) so the whole
// module is a deterministic test surface with no clock mocking.
import { STATUSES, type Job, type Status, type StatusChange } from './types';

/** Days after the last contact (apply, or last follow-up) before a follow-up falls due. */
const FOLLOWUP_DAYS = 7;

/** Normalize any string to a known Status, defaulting to 'Saved'. */
export function normStatus(s?: string): Status {
  return (STATUSES as string[]).indexOf(s || '') > -1 ? (s as Status) : 'Saved';
}

/** Local-time YYYY-MM-DD for `now`. */
function today(now: Date): string {
  const p = (n: number) => (n < 10 ? '0' : '') + n;
  return now.getFullYear() + '-' + p(now.getMonth() + 1) + '-' + p(now.getDate());
}

/** Whole days between an ISO-ish date string and `now`; null for missing/invalid input. */
export function daysSince(s: string | undefined, now: Date = new Date()): number | null {
  if (!s) return null;
  const t = Date.parse(s);
  return isNaN(t) ? null : Math.floor((now.getTime() - t) / 86400000);
}

/** Everything the UI needs to render a Job's lifecycle state, derived in one pass. */
export interface JobState {
  status: Status;
  /** In the default Active queue: not retired, and either still Saved or pinned priority. */
  isActive: boolean;
  /** Eligible for the "Mark applied" action (still Saved). */
  isApplyable: boolean;
  /** Whole days since the Job was first applied to, or null. */
  appliedDaysAgo: number | null;
  followUp: {
    /** Whether this status participates in the follow-up loop (Applied or Interviewing). */
    tracked: boolean;
    /** The follow-up is due now. */
    due: boolean;
    /** Days remaining until the follow-up falls due, or null when not applicable. */
    daysUntil: number | null;
    /** Whole days since the last logged follow-up, or null. */
    loggedDaysAgo: number | null;
  };
}

/** Derive a Job's lifecycle state as of `now`. */
export function deriveJobState(job: Job, now: Date = new Date()): JobState {
  const status = normStatus(job.status);
  const tracked = status === 'Applied' || status === 'Interviewing';
  const refAge = daysSince(job.followUp || job.applied, now);
  const due = !job.archived && tracked && refAge != null && refAge >= FOLLOWUP_DAYS;
  return {
    status,
    isActive: !job.archived && (status === 'Saved' || !!job.priority),
    isApplyable: status === 'Saved',
    appliedDaysAgo: daysSince(job.applied, now),
    followUp: {
      tracked,
      due,
      daysUntil: tracked && !due && refAge != null ? FOLLOWUP_DAYS - refAge : null,
      loggedDaysAgo: daysSince(job.followUp, now),
    },
  };
}

/** Statuses past Applied — a backfilled history ends in one of these when the job got that far. */
const BEYOND_APPLIED: Status[] = ['Interviewing', 'Offer', 'Rejected'];

/**
 * The job's dated status history. Stored history wins; for legacy jobs without any it is
 * derived (never persisted) from `applied` and the current status.
 */
export function effectiveHistory(job: Job): StatusChange[] {
  if (job.history && job.history.length) return job.history;
  if (!job.applied) return [];
  const out: StatusChange[] = [{ status: 'Applied', at: job.applied }];
  const cur = normStatus(job.status);
  if (BEYOND_APPLIED.includes(cur)) out.push({ status: cur, at: job.applied });
  return out;
}

/**
 * Apply a status transition. Stamps `applied` on first entry to Applied, and appends a dated
 * entry to `history` only when the status actually changes.
 */
export function applyStatus(job: Job, next: Status, now: Date = new Date()): Job {
  const changed = normStatus(job.status) !== next;
  const n: Job = { ...job, status: next };
  if (changed) n.history = [...effectiveHistory(job), { status: next, at: today(now) }];
  if (next === 'Applied' && !n.applied) n.applied = today(now);
  return n;
}

/** Record a follow-up today, restarting the follow-up clock. */
export function logFollowUp(job: Job, now: Date = new Date()): Job {
  return { ...job, followUp: today(now) };
}
