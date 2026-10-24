// The Pipeline row model (#129): what one job card of the list offers. Pure and DOM-free. A row
// has at most one primary action; everything else goes in its menu.
import { deriveJobState } from './jobState';
import { metaLines } from './metaLines';
import { prettyTitle } from './store';
import { VERDICTS } from './screening';
import type { Job, Verdict } from './types';

/** A row's title: the saved label, else one derived from the URL. */
export const titleOf = (job: Job) => job.label || prettyTitle(job.url);

/** What names a saved job's posting link (PostingLink): its URL, title and company. */
export const postingOf = (job: Job) => ({
  url: job.url,
  title: titleOf(job),
  company: job.company,
});

/** The one next step a row offers: apply to a saved job, or log a due follow-up. */
export type NextStep = 'apply' | 'followup';

export function primaryAction(job: Job, now: Date = new Date()): NextStep | null {
  if (job.archived) return null;
  const s = deriveJobState(job, now);
  if (s.isApplyable) return 'apply';
  if (s.followUp.due) return 'followup';
  return null;
}

/** When the job was applied to, for a row: "Today", "10d ago", or null if it never was. */
export function appliedAgo(job: Job, now: Date = new Date()): string | null {
  const d = deriveJobState(job, now).appliedDaysAgo;
  if (d == null) return null;
  return d <= 0 ? 'Today' : `${d}d ago`;
}

/** The follow-up clock, for a row: due now, due in N days, or null when there is none. */
export function followUpOf(
  job: Job,
  now: Date = new Date(),
): { due: true } | { due: false; inDays: number } | null {
  if (job.archived) return null;
  const f = deriveJobState(job, now).followUp;
  if (f.due) return { due: true };
  return f.daysUntil != null ? { due: false, inDays: f.daysUntil } : null;
}

/** Everything one Pipeline row shows, worked out once for the cards. */
export interface RowView {
  title: string;
  /** Retired (when it is), company, location: one line per two items (#192). */
  factLines: string[];
  /** A retired job's fit drops to neutral, like its status: it no longer competes for attention. */
  verdict:
    | { value: Verdict; label: string; tone: (typeof VERDICTS)[number]['tone'] | 'neutral' }
    | undefined;
  applied: string | null;
  followUp: ReturnType<typeof followUpOf>;
  next: NextStep | null;
  pinned: boolean;
  retired: boolean;
}

export function rowView(job: Job, now: Date = new Date()): RowView {
  const verdict = VERDICTS.find((v) => v.value === job.verdict);
  return {
    title: titleOf(job),
    factLines: metaLines([job.archived ? 'Retired' : '', job.company, job.location]),
    verdict: verdict && job.archived ? { ...verdict, tone: 'neutral' } : verdict,
    applied: appliedAgo(job, now),
    followUp: followUpOf(job, now),
    next: primaryAction(job, now),
    pinned: !!job.priority,
    retired: !!job.archived,
  };
}
