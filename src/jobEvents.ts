// Interview / call log on a Job, plus the calendar views derived from it: .ics export events and
// the This-week agenda. Pure and DOM-free; `now` is always injected (local time).
import type { IcsEvent } from './ics';
import { deriveJobState } from './jobState';
import type { Job, JobEvent, JobEventKind } from './types';

/** Days after the last contact before a follow-up is due (mirrors jobState's rule). */
const FOLLOWUP_DAYS = 7;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const pad = (n: number) => String(n).padStart(2, '0');

/** Local YYYY-MM-DD. */
function ymd(d: Date): string {
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
  const m = ref ? DATE_RE.exec(ref) : null;
  if (!m) return null;
  return ymd(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + FOLLOWUP_DAYS));
}

/** Small deterministic string hash (djb2) → base36, for stable calendar UIDs. */
export function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

const KIND_WORD: Record<JobEventKind, string> = {
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

export interface AgendaItem {
  date: string;
  time?: string;
  kind: JobEventKind | 'followup';
  jobUrl: string;
  label: string;
  company?: string;
  overdue?: boolean;
}

/** Current Mon–Sun week (local) as inclusive YYYY-MM-DD bounds. */
function weekBounds(now: Date): [string, string] {
  const back = (now.getDay() + 6) % 7; // Mon=0 … Sun=6
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  return [ymd(start), ymd(end)];
}

/** Interviews/calls in the current Mon–Sun week, plus follow-ups due this week or overdue
 *  (overdue ones land on today). Archived jobs excluded. Sorted by date, all-day first. */
export function weekAgenda(jobs: readonly Job[], now: Date): AgendaItem[] {
  const [start, end] = weekBounds(now);
  const today = ymd(now);
  const items: AgendaItem[] = [];
  for (const job of jobs) {
    if (job.archived) continue;
    const base = { jobUrl: job.url, label: job.label, company: job.company };
    for (const e of job.events ?? []) {
      if (e.date >= start && e.date <= end) {
        items.push({ ...base, date: e.date, time: e.time, kind: e.kind });
      }
    }
    const fu = followUpDate(job, now);
    if (fu && fu < today) {
      items.push({ ...base, date: today, kind: 'followup', overdue: true });
    } else if (fu && fu >= start && fu <= end) {
      items.push({ ...base, date: fu, kind: 'followup' });
    }
  }
  return items.sort(cmpEvents);
}
