// The Today read model (simplify #383; docs/specs/simplify.md): Apply and Follow up as Today shows
// them, and the line under each. Pure over the saved jobs, so the words are table-tested; Today.tsx
// lays them out (Review new counts its own postings, ReviewView). The queues are the Pipeline's own
// (applyQueue.ts, jobEvents.ts), so both pages always agree.
import { followUpJobs, toApplyQueue } from './applyQueue';
import { dueFollowUps, followUpDate, UPCOMING_DAYS, ymd } from './jobEvents';
import { jobIdOf } from './store';
import type { Job } from './types';

export interface TodayModel {
  /** To apply: its size, the job Start applying opens, and where it resumes (-1: from the top). */
  apply: { count: number; start: Job | null; resumeAt: number };
  /** Due follow-ups (most overdue first), how many more are waiting, and how many of those fall
   *  due in the coming 7 days. */
  followUp: { due: Job[]; waiting: number; upcoming: number };
}

export function today(jobs: Job[], now: Date, lastApplyId: string | null = null): TodayModel {
  const queue = toApplyQueue(jobs);
  // Back from Apply mode at "2 of 3": Start applying picks up there (as on the Pipeline).
  const resumeAt = lastApplyId ? queue.findIndex((j) => jobIdOf(j.url) === lastApplyId) : -1;
  const due = dueFollowUps(jobs, now).map((d) => d.job);
  const dueUrls = new Set(due.map((j) => j.url));
  const rest = followUpJobs(jobs, now).filter((j) => !dueUrls.has(j.url));
  const weekOut = new Date(now);
  weekOut.setDate(weekOut.getDate() + UPCOMING_DAYS);
  const lastDay = ymd(weekOut);
  const upcoming = rest.filter((j) => (followUpDate(j, now) ?? '9') <= lastDay).length;
  return {
    apply: { count: queue.length, start: queue[Math.max(0, resumeAt)] ?? null, resumeAt },
    followUp: { due, waiting: rest.length, upcoming },
  };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function applyLine(count: number): string {
  return count > 0
    ? `${plural(count, 'saved job')}, not yet applied`
    : 'Nothing saved to apply to yet';
}

/** "Upcoming: N this week": follow-ups falling due in the next 7 days, after today's. */
export function upcomingLine(n: number): string {
  return n > 0 ? `Upcoming: ${n} this week` : 'Nothing else this week';
}
