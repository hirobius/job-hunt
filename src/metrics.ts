// Pipeline metrics — pure, DOM-free read-side stats over the Job list: apply cadence,
// response / interview rates, time to first reply and a weekly applied series. Dates come from
// each job's effective status history; `now` is injected so the module needs no clock mocking.
import { deriveJobState, effectiveHistory } from './jobState';
import type { Job, Status } from './types';

const RESPONSE: Status[] = ['Interviewing', 'Offer', 'Rejected'];
const INTERVIEW: Status[] = ['Interviewing', 'Offer'];

export interface PipelineMetrics {
  appliedLast7: number;
  /** Applied in the 7 days before those (7–13 days ago): the trend's baseline. */
  appliedPrev7: number;
  appliedLast30: number;
  appliedTotal: number;
  /** Applied jobs that got any reply (interview, offer or rejection). */
  responded: number;
  /** Applied jobs that reached interviews (an offer counts: it needs them). */
  interviewed: number;
  /** Applied jobs that reached an offer. */
  offered: number;
  responseRate: number | null;
  interviewRate: number | null;
  medianDaysToResponse: number | null;
  followUpsDue: number;
}

export interface WeekBucket {
  /** Monday of the week, local YYYY-MM-DD. */
  weekStart: string;
  count: number;
}

const pad = (n: number) => (n < 10 ? '0' : '') + n;
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Local midnight of a YYYY-MM-DD or ISO datetime string; null if invalid. */
function localDay(s: string | undefined): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(s);
  if (isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Whole calendar days from a to b (DST-safe). */
const dayDiff = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86400000);

/** Monday (local midnight) of the week containing d. */
function mondayOf(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
}

/** The day a job was applied: first Applied history entry, falling back to `applied`. */
function appliedDay(job: Job): Date | null {
  const first = effectiveHistory(job).find((h) => h.status === 'Applied');
  return localDay(first?.at) ?? localDay(job.applied);
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function pipelineMetrics(jobs: Job[], now: Date = new Date()): PipelineMetrics {
  const today = localDay(ymd(now)) as Date;
  let appliedTotal = 0;
  let appliedLast7 = 0;
  let appliedPrev7 = 0;
  let appliedLast30 = 0;
  let responded = 0;
  let interviewed = 0;
  let offered = 0;
  const replyDays: number[] = [];
  for (const job of jobs) {
    const applied = appliedDay(job);
    if (!applied) continue;
    appliedTotal++;
    const age = dayDiff(applied, today);
    if (age >= 0 && age < 7) appliedLast7++;
    if (age >= 7 && age < 14) appliedPrev7++;
    if (age >= 0 && age < 30) appliedLast30++;
    const hist = effectiveHistory(job);
    const first = hist.find((h) => RESPONSE.includes(h.status));
    if (first) {
      responded++;
      const at = first.derived ? null : localDay(first.at); // legacy backfill: date unknown
      if (at) replyDays.push(Math.max(0, dayDiff(applied, at)));
    }
    if (hist.some((h) => INTERVIEW.includes(h.status))) interviewed++;
    if (hist.some((h) => h.status === 'Offer')) offered++;
  }
  return {
    appliedLast7,
    appliedPrev7,
    appliedLast30,
    appliedTotal,
    responded,
    interviewed,
    offered,
    responseRate: appliedTotal ? responded / appliedTotal : null,
    interviewRate: appliedTotal ? interviewed / appliedTotal : null,
    medianDaysToResponse: median(replyDays),
    followUpsDue: jobs.filter((j) => deriveJobState(j, now).followUp.due).length,
  };
}

/** The trend line under "applied, last 7 days": this week against the 7 days before. */
export function vsWeekBefore(cur: number, prev: number): string {
  if (cur === prev) return 'Same as the week before';
  return `${cur > prev ? '+' : '−'}${Math.abs(cur - prev)} vs the week before`;
}

/** Applications per Mon–Sun week, oldest → newest; the last bucket is the current week. */
export function weeklyApplied(jobs: Job[], now: Date = new Date(), weeks = 8): WeekBucket[] {
  const start = mondayOf(now);
  const buckets: WeekBucket[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() - 7 * i);
    buckets.push({ weekStart: ymd(d), count: 0 });
  }
  const byStart = new Map(buckets.map((b) => [b.weekStart, b]));
  for (const job of jobs) {
    const d = appliedDay(job);
    if (d) {
      const b = byStart.get(ymd(mondayOf(d)));
      if (b) b.count++;
    }
  }
  return buckets;
}
