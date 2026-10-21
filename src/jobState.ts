// Job lifecycle — the model owning a Job's Status transitions and its follow-up
// clock. Pure and DOM-free: read-side derivations for the UI (deriveJobState) and
// write-side transitions (applyStatus, logFollowUp, snoozeFollowUp). The store delegates here for
// the rules and keeps persistence; the view reads `deriveJobState` instead of
// recomputing the rules per render. `now` is injected (defaulted) so the whole
// module is a deterministic test surface with no clock mocking.
import { STATUSES, type Job, type Status, type StatusChange } from './types';

/** Days after the last contact (apply, or last follow-up) before a follow-up falls due. */
export const FOLLOWUP_DAYS = 7;

/** How far "Snooze" pushes a due follow-up. */
export const SNOOZE_DAYS = 3;

/** Normalize any string to a known Status, defaulting to 'Saved'. */
export function normStatus(s?: string): Status {
  return (STATUSES as string[]).indexOf(s || '') > -1 ? (s as Status) : 'Saved';
}

/** Local-time YYYY-MM-DD for `now`. */
function today(now: Date): string {
  const p = (n: number) => (n < 10 ? '0' : '') + n;
  return now.getFullYear() + '-' + p(now.getMonth() + 1) + '-' + p(now.getDate());
}

/** A stored snooze day, kept only when it is a real YYYY-MM-DD calendar day. */
export function normSnooze(s: unknown): string | undefined {
  if (typeof s !== 'string') return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return undefined;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return d.getMonth() === +m[2] - 1 && d.getDate() === +m[3] ? s : undefined;
}

/** Whole days between an ISO-ish date string and `now`; null for missing/invalid input. */
export function daysSince(s: string | undefined, now: Date = new Date()): number | null {
  if (!s) return null;
  // A bare YYYY-MM-DD is a LOCAL calendar day (Date.parse would read it as UTC midnight, which
  // shifts day boundaries by the UTC offset and disagrees with the calendar/This-week views).
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const t = m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : Date.parse(s);
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
  // A snooze holds the follow-up back until its day; it never brings one forward.
  const snoozeLeft = job.snoozeUntil ? -(daysSince(job.snoozeUntil, now) ?? 0) : 0;
  const due =
    !job.archived && tracked && refAge != null && refAge >= FOLLOWUP_DAYS && snoozeLeft <= 0;
  return {
    status,
    isActive: !job.archived && (status === 'Saved' || !!job.priority),
    isApplyable: status === 'Saved',
    appliedDaysAgo: daysSince(job.applied, now),
    followUp: {
      tracked,
      due,
      daysUntil:
        tracked && !due && refAge != null ? Math.max(FOLLOWUP_DAYS - refAge, snoozeLeft) : null,
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
  if (BEYOND_APPLIED.includes(cur)) out.push({ status: cur, at: job.applied, derived: true });
  return out;
}

/** "Saved 5 days ago" from the job's first Saved entry; empty when it has no saved date. */
export function savedAgo(job: Job, now: Date = new Date()): string {
  const d = daysSince(job.history?.find((h) => h.status === 'Saved')?.at, now);
  if (d == null) return '';
  return d <= 0 ? 'Saved today' : `Saved ${d} ${d === 1 ? 'day' : 'days'} ago`;
}

/**
 * Apply a status transition. Stamps `applied` on first entry to Applied, and appends a dated
 * entry to `history` only when the status actually changes.
 */
export function applyStatus(job: Job, next: Status, now: Date = new Date()): Job {
  const changed = normStatus(job.status) !== next;
  const n: Job = { ...job, status: next };
  if (changed)
    n.history = [
      ...effectiveHistory(job).map(({ status, at }) => ({ status, at })),
      { status: next, at: today(now) },
    ];
  if (next === 'Applied' && !n.applied) n.applied = today(now);
  return n;
}

/** Record a follow-up sent today, restarting the follow-up clock (and ending any snooze). */
export function logFollowUp(job: Job, now: Date = new Date()): Job {
  const { snoozeUntil: _s, ...rest } = job;
  return { ...rest, followUp: today(now) };
}

/** Push a due follow-up SNOOZE_DAYS out without recording one. */
export function snoozeFollowUp(job: Job, now: Date = new Date()): Job {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + SNOOZE_DAYS);
  return { ...job, snoozeUntil: today(d) };
}
