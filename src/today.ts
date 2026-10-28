// The Today read model (simplify 2/9, docs/specs/simplify.html design C): the home page's three
// counts in a fixed order (Review new, Apply, Follow up) and the line under each. Pure over the
// saved jobs, so the order and the words are table-tested; Today.tsx only lays them out. The
// queues are the Pipeline's own (applyQueue.ts, jobEvents.ts), so both pages always agree.
import { followUpJobs, toApplyQueue } from './applyQueue';
import { dueFollowUps, followUpDate, UPCOMING_DAYS, ymd } from './jobEvents';
import { dayLabel } from './dayLabel';
import { boardsFromUrls } from './feed/sources/ats';
import { jobIdOf } from './store';
import { titleOf } from './jobRow';
import type { Category } from './curation/types';
import type { Job } from './types';

/** The feeds a search reads with no board of its own: HN, Remotive, Jobicy, designsystems.jobs and
 *  Mastodon (the ones switched on in fetchFeed.ts SOURCE_ENABLED; today.test.ts keeps the two in
 *  step). Each is one source. Not imported from there: Today stays light and the feed's test mocks
 *  stay whole. */
export const KEYLESS_FEEDS = 5;

/** The track Companies last showed (DiscoverView keeps it in `rjb_active_category`), else the first. */
export function activeTrackId(categories: readonly Category[]): string | null {
  try {
    const stored = localStorage.getItem('rjb_active_category');
    if (stored && categories.some((c) => c.id === stored)) return stored;
  } catch {
    /* storage blocked: the first track */
  }
  return categories[0]?.id ?? null;
}

/** What Review new knows: how many postings are new today (null until the Feed slice counts them)
 *  and how many sources they come from. */
export interface ReviewCounts {
  newToday: number | null;
  sources: number;
}

export interface TodayModel {
  review: ReviewCounts;
  /** To apply: its size, the job Start applying opens, and where it resumes (-1: from the top). */
  apply: { count: number; start: Job | null; resumeAt: number };
  /** Due follow-ups (most overdue first), how many more are waiting, how many of those fall due
   *  in the coming 7 days, and the next one to fall due. */
  followUp: {
    due: Job[];
    waiting: number;
    upcoming: number;
    next: { job: Job; date: string } | null;
  };
}

export function today(
  jobs: Job[],
  review: ReviewCounts,
  now: Date,
  lastApplyId: string | null = null,
): TodayModel {
  const queue = toApplyQueue(jobs);
  // Back from Apply mode at "2 of 3": Start applying picks up there (as on the Pipeline).
  const resumeAt = lastApplyId ? queue.findIndex((j) => jobIdOf(j.url) === lastApplyId) : -1;
  const due = dueFollowUps(jobs, now).map((d) => d.job);
  const dueUrls = new Set(due.map((j) => j.url));
  const rest = followUpJobs(jobs, now).filter((j) => !dueUrls.has(j.url));
  const nextDate = rest[0] && followUpDate(rest[0], now);
  const weekOut = new Date(now);
  weekOut.setDate(weekOut.getDate() + UPCOMING_DAYS);
  const lastDay = ymd(weekOut);
  const upcoming = rest.filter((j) => (followUpDate(j, now) ?? '9') <= lastDay).length;
  return {
    review,
    apply: { count: queue.length, start: queue[Math.max(0, resumeAt)] ?? null, resumeAt },
    followUp: {
      due,
      waiting: rest.length,
      upcoming,
      next: nextDate ? { job: rest[0], date: nextDate } : null,
    },
  };
}

/** Sources a search reads: each distinct watched board once, plus the keyless feeds. */
export function countSources(tileUrls: string[], feeds = KEYLESS_FEEDS): number {
  return boardsFromUrls(tileUrls, Infinity).length + feeds;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function reviewLine({ newToday, sources }: ReviewCounts): string {
  const from = `from ${plural(sources, 'source')}`;
  if (newToday == null) return `New postings ${from}`;
  return newToday > 0 ? `${newToday} new today ${from}` : `Nothing new today ${from}`;
}

export function applyLine(count: number): string {
  return count > 0
    ? `${plural(count, 'saved job')}, not yet applied`
    : 'Nothing saved to apply to yet';
}

/** "Upcoming: N this week": follow-ups falling due in the next 7 days, after today's. */
export function upcomingLine(n: number): string {
  return n > 0 ? `Upcoming: ${n} this week` : 'Nothing else this week';
}

const nameOf = (j: Job) => j.company?.trim() || titleOf(j);
const SHOWN = 3;

export function followUpLine(f: TodayModel['followUp'], now: Date): string {
  if (f.due.length > 0) {
    const names = f.due.slice(0, SHOWN).map(nameOf).join(', ');
    const more = f.due.length - SHOWN;
    return `Due: ${names}${more > 0 ? ` and ${more} more` : ''}`;
  }
  if (f.next) return `Nothing due. Next: ${nameOf(f.next.job)}, ${dayLabel(f.next.date, now)}`;
  return 'Nothing waiting on a reply';
}
