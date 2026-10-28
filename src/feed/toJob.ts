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
  /** A solicitation's response deadline (YYYY-MM-DD): the job's follow-up date. */
  deadline?: string;
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
  const note = [found, p.deadline && `Response due ${p.deadline}`, signals]
    .filter(Boolean)
    .join(' · ');
  const fields: JobFields = { label, company: p.company, location: p.location, mode: p.mode, note };
  if (p.deadline) fields.deadline = p.deadline;
  return fields;
}
