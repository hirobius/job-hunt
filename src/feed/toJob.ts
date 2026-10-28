// A ranked Posting → the fields a tracked Job is saved with (src/store.ts `addJobDetailed`). Kept
// here, beside the feed's model, so the save path is testable without rendering the panel.
import type { JobMode } from '../types';
import { HN_NO_ROLE } from './sources/hn';
import { SOURCE_LABEL, type RankedPosting } from './types';

export interface JobFields {
  label: string;
  company: string;
  location: string;
  mode?: JobMode;
  note: string;
  /** When applications close (YYYY-MM-DD), where the source says. */
  deadline?: string;
  /** When the employer posted it and when the feed first read it (#419). */
  postedAt?: string;
  discoveredAt?: string;
}

export function jobFieldsFor(p: RankedPosting, term: string, from = 'Live postings'): JobFields {
  const label =
    p.source === 'hn' && p.title === HN_NO_ROLE
      ? p.company
        ? `${p.company}: roles listed in post`
        : 'Hacker News hiring post'
      : p.title;
  // The signals ride along so the Tracker keeps why this one was worth saving.
  const signals = p.signals.map((s) => s.label).join(', ');
  const found = term
    ? `Found in ${from} · ${SOURCE_LABEL[p.source]} · “${term}”`
    : `Found in ${from} · ${SOURCE_LABEL[p.source]}`;
  // A solicitation's deadline is a response date; a job's closing date shows on its own line.
  const note = [found, p.source === 'sam' && p.deadline && `Response due ${p.deadline}`, signals]
    .filter(Boolean)
    .join(' · ');
  const fields: JobFields = { label, company: p.company, location: p.location, mode: p.mode, note };
  if (p.deadline) fields.deadline = p.deadline;
  if (p.postedAt) fields.postedAt = p.postedAt;
  if (p.discoveredAt) fields.discoveredAt = p.discoveredAt;
  return fields;
}
