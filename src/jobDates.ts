// A job's dates (#419): when it was posted, found and saved, and when applications close. Pure and
// DOM-free: the store normalizes with these on read, the cards and the job page show `dateLabel`
// and `closingOf`, and the Pipeline's Closing soon / Closed filters read `isClosingSoon` / `isClosed`.
// The closing day is the job's `deadline` (a source's closing date, or the one typed on the job
// page); `closedAt` is stamped by the board check (feed/liveness.ts) when the posting is gone.
import { daysSince, deriveJobState } from './jobState';
import { shortDate } from './metaLines';
import type { LiveCheck } from './feed/liveness';
import type { Job } from './types';

/** "Closing soon" is today and the next 6 days: the same window as the Pipeline's Next 7 days. */
export const CLOSING_SOON_DAYS = 7;

/** A stored date kept as written when it reads as one (a bare day or an ISO timestamp). */
export function normDate(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const s = raw.trim();
  if (!s || s.length > 40 || !/^\d{4}-\d{2}-\d{2}/.test(s) || Number.isNaN(Date.parse(s)))
    return undefined;
  return s;
}

/** A stored job's four dates, normalized (a malformed one is dropped) with savedAt backfilled. */
export function normJobDates(
  job: Job,
): Pick<Job, 'postedAt' | 'discoveredAt' | 'savedAt' | 'closedAt'> {
  const out: Pick<Job, 'postedAt' | 'discoveredAt' | 'savedAt' | 'closedAt'> = {};
  const postedAt = normDate(job.postedAt);
  const discoveredAt = normDate(job.discoveredAt);
  const savedAt = savedAtOf(job);
  const closedAt = normDate(job.closedAt);
  if (postedAt) out.postedAt = postedAt;
  if (discoveredAt) out.discoveredAt = discoveredAt;
  if (savedAt) out.savedAt = savedAt;
  if (closedAt) out.closedAt = closedAt;
  return out;
}

/** When the job was saved: its own stamp, else the first Saved entry of its history (a job saved
 *  before the stamp existed). Blank when nothing says: an applied date is not a save date. */
export function savedAtOf(job: Job): string | undefined {
  return normDate(job.savedAt) ?? normDate(job.history?.find((h) => h.status === 'Saved')?.at);
}

/** Days from today to a date (negative once it has passed); null when it is not a date. */
const daysUntil = (s: string | undefined, now: Date) => {
  const d = daysSince(s, now);
  return d == null ? null : -d;
};

const ago = (d: number) => (d <= 0 ? 'today' : `${d}d ago`);

/** The one date a job shows (Adrian 2026-10-28): "Posted 3d ago" when the source said, else
 *  "Found 3d ago" (when the feed first read it, or when it was saved by hand). Saved and found
 *  are still stored, for sorting; null when nothing is known. */
export function dateLabel(job: Job, now: Date = new Date()): string | null {
  const posted = daysSince(job.postedAt, now);
  if (posted != null) return `Posted ${ago(posted)}`;
  const found = daysSince(job.discoveredAt ?? savedAtOf(job), now);
  return found == null ? null : `Found ${ago(found)}`;
}

export type Closing = { kind: 'closed' | 'soon' | 'later'; label: string } | null;

/** The job's closing line: "Closed" (gone from its board, or past its closing day), else
 *  "Closes Nov 3", `soon` (shown in the warning tone) within CLOSING_SOON_DAYS days. Only while it
 *  matters: a closing day until applied, a gone posting until past Applied (the stages the board
 *  check reads), never once set aside. */
export function closingOf(job: Job, now: Date = new Date()): Closing {
  if (job.archived) return null;
  const status = deriveJobState(job, now).status;
  if (job.closedAt && (status === 'Saved' || status === 'Applied'))
    return { kind: 'closed', label: 'Closed' };
  const d = daysUntil(job.deadline, now);
  if (status !== 'Saved' || d == null || !job.deadline) return null;
  if (d < 0) return { kind: 'closed', label: 'Closed' };
  const label = `Closes ${shortDate(job.deadline)}`;
  return { kind: d < CLOSING_SOON_DAYS ? 'soon' : 'later', label };
}

/** Still to apply to, and applications close today or within the next 6 days. */
export function isClosingSoon(job: Job, now: Date = new Date()): boolean {
  return closingOf(job, now)?.kind === 'soon';
}

/** Gone from its board, or past its closing day. Set-aside jobs are left out, as everywhere. */
export function isClosed(job: Job, now: Date = new Date()): boolean {
  return closingOf(job, now)?.kind === 'closed';
}

/** A board check's answers onto the jobs: closed stamps `closedAt` (the first time only), open
 *  clears it (the posting is back), unknown changes nothing. The same list when nothing changed. */
export function recordLiveness(jobs: Job[], results: ReadonlyMap<string, LiveCheck>): Job[] {
  let changed = false;
  const out = jobs.map((j) => {
    const r = results.get(j.url);
    if (r?.state === 'closed' && !j.closedAt) {
      changed = true;
      return { ...j, closedAt: r.checkedAt };
    }
    if (r?.state === 'open' && j.closedAt) {
      changed = true;
      const { closedAt: _c, ...rest } = j;
      return rest;
    }
    return j;
  });
  return changed ? out : jobs;
}

const dayCount = (n: number) => (n <= 0 ? 'today' : n === 1 ? '1 day' : `${n} days`);

/** "Fri, Nov 13" for a YYYY-MM-DD (local calendar day). */
function weekdayDate(s: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return shortDate(s);
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/** The one amber badge under a job's facts (#538, redesign §5.5): a closing date within the week
 *  ("Closes Fri, Nov 13 · 3 days") or a due follow-up ("Follow-up due · 12 days since you
 *  applied"). Null when no date needs action: a missing deadline is not a status. */
export function dueBadgeOf(
  job: Job,
  now: Date = new Date(),
): { kind: 'closing' | 'followup'; label: string } | null {
  const closing = closingOf(job, now);
  if (closing?.kind === 'soon' && job.deadline) {
    const d = daysUntil(job.deadline, now) ?? 0;
    return { kind: 'closing', label: `Closes ${weekdayDate(job.deadline)} · ${dayCount(d)}` };
  }
  const state = deriveJobState(job, now);
  if (!job.archived && state.followUp?.due) {
    const since = state.appliedDaysAgo;
    return {
      kind: 'followup',
      label:
        since != null && since > 0
          ? `Follow-up due · ${dayCount(since)} since you applied`
          : 'Follow-up due',
    };
  }
  return null;
}
