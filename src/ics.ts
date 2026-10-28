// A tiny, pure RFC 5545 (iCalendar) writer — enough for "Add to calendar" on a job: timed
// interviews and all-day follow-up reminders. No dependency, no clock: `now` is injected.
//   - TEXT values are escaped (§3.3.11): backslash, semicolon, comma, newline.
//   - Content lines are folded at 75 octets (§3.1), never inside a UTF-8 character.
//   - Timed events are "floating" local time (no TZID): an interview at 2pm is 2pm wherever
//     the calendar opens it, which is what a person typing "14:00" means.
//   - All-day events use VALUE=DATE with an exclusive next-day DTEND.
import { BRAND } from './brand';

/** How long a timed event lasts when it has no duration, in the .ics and the agenda alike. */
export const DEFAULT_EVENT_MIN = 60;

export interface IcsEvent {
  /** Stable per-event id (gets `@uidDomain` appended). */
  uid: string;
  summary: string;
  /** YYYY-MM-DD (local). */
  date: string;
  /** HH:MM (local). Absent → all-day. */
  time?: string;
  /** Timed events only; default DEFAULT_EVENT_MIN. */
  durationMin?: number;
  description?: string;
  url?: string;
}

export interface IcsOptions {
  now: Date;
  uidDomain?: string;
}

/** Escape a TEXT property value. */
export function escapeText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

const enc = new TextEncoder();

/** Fold one content line to ≤75 octets per physical line (continuations start with a space). */
export function foldLine(line: string): string {
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = '';
  let curLen = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    // The first physical line holds 75 octets; continuations hold 74 + the leading space.
    const limit = out.length === 0 ? 75 : 74;
    if (curLen + n > limit) {
      out.push(cur);
      cur = '';
      curLen = 0;
    }
    cur += ch;
    curLen += n;
  }
  out.push(cur);
  return out.map((p, i) => (i === 0 ? p : ' ' + p)).join('\r\n');
}

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
const hms = (d: Date) =>
  `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;

/** Parse a local date (+ optional time) into a Date whose UTC fields hold the local wall time —
 *  a timezone-free way to do calendar arithmetic. */
function wall(date: string, time = '00:00'): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh || 0, mm || 0));
}

function vevent(e: IcsEvent, stamp: string, domain: string): string[] {
  const lines = ['BEGIN:VEVENT', `UID:${e.uid}@${domain}`, `DTSTAMP:${stamp}`];
  if (e.time) {
    const start = wall(e.date, e.time);
    const end = new Date(start.getTime() + (e.durationMin ?? DEFAULT_EVENT_MIN) * 60000);
    lines.push(`DTSTART:${ymd(start)}T${hms(start)}`, `DTEND:${ymd(end)}T${hms(end)}`);
  } else {
    const start = wall(e.date);
    const end = new Date(start.getTime() + 86400000);
    lines.push(`DTSTART;VALUE=DATE:${ymd(start)}`, `DTEND;VALUE=DATE:${ymd(end)}`);
  }
  lines.push(`SUMMARY:${escapeText(e.summary)}`);
  if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
  if (e.url) lines.push(`URL:${e.url}`);
  lines.push('END:VEVENT');
  return lines;
}

/** Build a whole VCALENDAR document (CRLF line endings, trailing CRLF). */
export function buildIcs(events: readonly IcsEvent[], opts: IcsOptions): string {
  const stamp = `${ymd(opts.now)}T${hms(opts.now)}Z`;
  const domain = opts.uidDomain ?? 'apply-board';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${BRAND.name}//Tracker//EN`,
    'CALSCALE:GREGORIAN',
    ...events.flatMap((e) => vevent(e, stamp, domain)),
    'END:VCALENDAR',
  ];
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
