// CSV export of the job list — pure, so the format and its safety rule are unit-tested.
// Every cell is quoted; any cell that a spreadsheet would read as a formula (leading = + - @,
// tab or CR — OWASP "CSV injection") is prefixed with a single quote so it opens as text.
import { deriveJobState } from './jobState';
import type { Job } from './types';
import { withoutSample } from './demo/isSample';

const FORMULA_START = /^[=+\-@\t\r]/;

/** Quote one cell, neutralizing a formula-looking start. */
export function csvCell(value: unknown): string {
  let s = String(value ?? '');
  if (FORMULA_START.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

const opt = (v: string | number | undefined | null) => (v == null ? '' : String(v));

/** Column name → value. The order here is the column order of the file. */
const COLUMNS: [string, (j: Job) => string][] = [
  ['label', (j) => j.label],
  ['url', (j) => j.url],
  ['status', (j) => deriveJobState(j).status],
  ['company', (j) => opt(j.company)],
  ['location', (j) => opt(j.location)],
  ['seniority', (j) => opt(j.seniority)],
  ['applied', (j) => opt(j.applied)],
  ['follow_up', (j) => opt(j.followUp)],
  ['resume', (j) => opt(j.resume)],
  ['contact', (j) => opt(j.contact)],
  ['salary', (j) => opt(j.salary)],
  ['verdict', (j) => opt(j.verdict)],
  ['mode', (j) => opt(j.mode)],
  ['blockers', (j) => (j.blockers || []).join('|')],
  ['angle', (j) => opt(j.angle)],
  ['screened_at', (j) => opt(j.screenedAt)],
  ['priority', (j) => (j.priority ? 'yes' : '')],
  ['retired', (j) => (j.archived ? 'yes' : '')],
  ['note', (j) => opt(j.note)],
  ['notes', (j) => opt(j.notes)],
  ['todos', (j) => (j.todos || []).map((t) => `[${t.done ? 'x' : ' '}] ${t.text}`).join(' | ')],
  ['history', (j) => (j.history || []).map((h) => `${h.status} ${h.at}`).join(' > ')],
  [
    'events',
    (j) =>
      (j.events || [])
        .map((e) => [e.kind, e.date, e.time, e.note].filter(Boolean).join(' '))
        .join(' | '),
  ],
];

export const CSV_COLUMNS: readonly string[] = COLUMNS.map(([name]) => name);

/** The whole file: a header row, then one row per job, CRLF-separated. Sample data (#107) is
 *  left out, so a demo never leaks into a real export. */
export function toCsv(jobs: readonly Job[]): string {
  const rows = [CSV_COLUMNS.map(csvCell).join(',')];
  for (const j of withoutSample(jobs))
    rows.push(COLUMNS.map(([, get]) => csvCell(get(j))).join(','));
  return rows.join('\r\n');
}
