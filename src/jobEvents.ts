// Interview / call log on a Job, plus the calendar views derived from it: .ics export events and
// Today's lists (due follow-ups, the next 7 days). Pure and DOM-free; `now` is always injected (local time).
import type { IcsEvent } from './ics';
import { deriveJobState, FOLLOWUP_DAYS } from './jobState';
import type { Job, JobEvent, JobEventKind } from './types';

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const pad = (n: number) => String(n).padStart(2, '0');

/** Local YYYY-MM-DD. */
export function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Strictly valid calendar date (rejects 2026-02-31). */
function validDate(s: unknown): s is string {
  if (typeof s !== 'string' || s.length !== 10) return false;
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
}

const cmpEvents = (a: { date: string; time?: string }, b: { date: string; time?: string }) =>
  a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '');

/** Append an event; returns a new list sorted by date + time. Input without a valid date is ignored. */
export function addEvent(
  events: readonly JobEvent[] | undefined,
  input: Omit<JobEvent, 'id'>,
  genId: () => string = () => crypto.randomUUID(),
): JobEvent[] {
  const list = events ?? [];
  if (!validDate(input.date)) return [...list];
  const ev: JobEvent = { id: genId(), kind: input.kind, date: input.date };
  if (input.time && TIME_RE.test(input.time)) ev.time = input.time;
  if (input.durationMin && input.durationMin > 0) ev.durationMin = input.durationMin;
  const note = input.note?.trim();
  if (note) ev.note = note;
  return [...list, ev].sort(cmpEvents);
}

export function removeEvent(events: readonly JobEvent[] | undefined, id: string): JobEvent[] {
  return (events ?? []).filter((e) => e.id !== id);
}

/** Local YYYY-MM-DD on which the job's follow-up falls due, or null when not tracked / archived. */
export function followUpDate(job: Job, now: Date): string | null {
  if (job.archived || !deriveJobState(job, now).followUp.tracked) return null;
  const ref = job.followUp || job.applied;
  const m = ref ? DATE_RE.exec(ref.slice(0, 10)) : null;
  if (!m) return null;
  const clock = ymd(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + FOLLOWUP_DAYS));
  return job.snoozeUntil && job.snoozeUntil > clock ? job.snoozeUntil : clock;
}

/** Small deterministic string hash (djb2) → base36, for stable calendar UIDs. */
export function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** How an event kind reads in a title ("Interview: …", "Call · …"). */
export const KIND_WORD: Record<JobEventKind, string> = {
  interview: 'Interview',
  call: 'Call',
  other: 'Event',
};

/** All upcoming events (date >= today, local) for a job, plus its follow-up, as .ics events. */
export function jobIcsEvents(job: Job, now: Date): IcsEvent[] {
  const today = ymd(now);
  const key = hash(job.url);
  const where = job.company ? ` (${job.company})` : '';
  const out: IcsEvent[] = (job.events ?? [])
    .filter((e) => e.date >= today)
    .sort(cmpEvents)
    .map((e) => ({
      uid: `${key}-${e.id}`,
      summary: `${KIND_WORD[e.kind]}: ${job.label}${where}`,
      date: e.date,
      time: e.time,
      durationMin: e.durationMin,
      description: [e.note, job.url].filter(Boolean).join('\n'),
      url: job.url,
    }));
  const fu = followUpDate(job, now);
  if (fu) {
    out.push({
      uid: `${key}-followup`,
      summary: `Follow up: ${job.label}${where}`,
      date: fu < today ? today : fu,
      description: job.url,
      url: job.url,
    });
  }
  return out;
}

/** How many days ahead Today's agenda looks, today included. */
export const UPCOMING_DAYS = 7;

/** One interview / call / other event on Today's "Next N days" list. */
export interface AgendaItem {
  /** The event's id (unique within its job). */
  id: string;
  date: string;
  time?: string;
  kind: JobEventKind;
  note?: string;
  jobUrl: string;
  label: string;
  company?: string;
}

/** Interviews, calls and other events from today through the next `days - 1` days (a rolling
 *  window, not the calendar week). Archived jobs excluded. Sorted by date, all-day first. */
export function upcomingEvents(
  jobs: readonly Job[],
  now: Date,
  days = UPCOMING_DAYS,
): AgendaItem[] {
  const start = ymd(now);
  const end = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + days - 1));
  const items: AgendaItem[] = [];
  for (const job of jobs) {
    if (job.archived) continue;
    for (const e of job.events ?? []) {
      if (e.date < start || e.date > end) continue;
      const item: AgendaItem = {
        id: e.id,
        date: e.date,
        kind: e.kind,
        jobUrl: job.url,
        label: job.label,
      };
      if (e.time) item.time = e.time;
      if (e.note) item.note = e.note;
      if (job.company) item.company = job.company;
      items.push(item);
    }
  }
  return items.sort(cmpEvents);
}

/** A job whose follow-up is due, and the day it fell due (today or earlier). */
export interface DueFollowUp {
  job: Job;
  dueDate: string;
}

/** Jobs whose follow-up is due now, most overdue first. */
export function dueFollowUps(jobs: readonly Job[], now: Date): DueFollowUp[] {
  const out: DueFollowUp[] = [];
  for (const job of jobs) {
    const dueDate = followUpDate(job, now);
    if (dueDate && deriveJobState(job, now).followUp.due) out.push({ job, dueDate });
  }
  return out.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}
