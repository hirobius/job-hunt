// The Pipeline's view state (#130): which status filter, search text and sort order the list is
// showing. It lives here, in memory, instead of inside TrackerView, so the job page's rail shows
// the same jobs the list did and the list is as you left it after opening a job and going Back.
// Pure rules plus one tiny store; nothing is persisted (a reload starts fresh on To apply).
import { createStore } from './createStore';
import { deriveJobState, localDay } from './jobState';
import { isClosed } from './jobDates';
import { respondByJobs, upcomingEvents } from './jobEvents';
import { sortJobs, type SortKey } from './jobSort';
import { classifyRemote } from './feed/mode';
import type { Job } from './types';

/** The named views (#541, redesign phase 2): the Apply list is walked by view, not by a Status
 *  select. Six named views, then All jobs (every job, set-aside ones too, so none is out of reach).
 *  This week (#640) holds what the phone's Next 7 days section did: interviews and closing dates. */
export type Filter =
  'toApply' | 'followUp' | 'thisWeek' | 'interviewing' | 'applied' | 'closed' | 'all';

export interface PipelineView {
  filter: Filter;
  sort: SortKey;
  q: string;
  /** Apply's "Remote only" switch (Adrian 2026-11-09): only remote jobs (`isRemoteJob`: the mode,
   *  else the title and location, #614). Kept per device (`rjb_apply_remote_only`), unlike the rest. */
  remoteOnly?: boolean;
}

export const DEFAULT_VIEW: PipelineView = { filter: 'toApply', sort: 'recent', q: '' };

export const FILTER_LABEL: Record<Filter, string> = {
  toApply: 'To apply',
  followUp: 'Follow up',
  thisWeek: 'This week',
  interviewing: 'Interviewing',
  applied: 'Applied',
  // #602: closed jobs collect here, where the person removes or keeps each one.
  closed: 'Recently closed',
  all: 'All jobs',
};

/** Each view's one-line description, shown under the chips for the open view. */
export const VIEW_DESCRIPTION: Record<Filter, string> = {
  toApply: 'Saved and still open, closing soonest first.',
  followUp: 'A week since you applied or last followed up: time to check in.',
  thisWeek: 'Interviews and closing dates in the next 7 days, soonest first.',
  interviewing: 'In interviews or holding an offer.',
  applied: 'Sent, waiting to hear back.',
  closed: 'Gone from the board or past the closing date. Remove or keep each one.',
  all: 'Every saved job, set-aside ones too.',
};

/** The six named views, in order; All jobs comes after them. */
export const NAMED_VIEWS: Filter[] = [
  'toApply',
  'followUp',
  'thisWeek',
  'interviewing',
  'applied',
  'closed',
];

/** This week's date for a job (#640): its soonest interview or event from today through the next
 *  6 days, or its closing date in that window (a Saved job), whichever comes first; else null. */
export function weekDateOf(j: Job, now: Date): string | null {
  const dates = [upcomingEvents([j], now)[0]?.date, respondByJobs([j], now)[0]?.dueDate].filter(
    (d): d is string => !!d,
  );
  return dates.length ? dates.sort()[0] : null;
}
export const VIEWS: Filter[] = [...NAMED_VIEWS, 'all'];

/** Whether a job is in a view: the one rule every count and list on Apply reads (the chips, the
 *  list, and the Follow up panel under the lg column). */
export function inView(j: Job, f: Filter, now: Date = new Date()): boolean {
  return matchesFilter(j, f, now);
}

function matchesFilter(j: Job, f: Filter, now: Date): boolean {
  const s = deriveJobState(j, now);
  if (f === 'all') return true;
  if (f === 'closed') return isClosed(j, now);
  if (j.archived) return false;
  if (f === 'toApply') return s.status === 'Saved' && !isClosed(j, now);
  if (f === 'followUp') return s.followUp.due;
  if (f === 'thisWeek') return weekDateOf(j, now) !== null;
  if (f === 'interviewing') return s.status === 'Interviewing' || s.status === 'Offer';
  return s.status === 'Applied';
}

/** To apply's order (#541): a job with a closing day first, soonest first; then the sort's order
 *  (newest by default). Stable, so ties keep the sort's order. */
function closingFirst(jobs: Job[]): Job[] {
  const key = (j: Job) => localDay(j.deadline) ?? '\uffff';
  return [...jobs].sort((a, b) => key(a).localeCompare(key(b)));
}

/** This week's order (#640): by its date, soonest first. Stable, so ties keep the sort's order. */
function soonestFirst(jobs: Job[], now: Date): Job[] {
  const key = (j: Job) => weekDateOf(j, now) ?? '\uffff';
  return [...jobs].sort((a, b) => key(a).localeCompare(key(b)));
}

/** Remote only's test (#614): the job's own mode when it has one; else the title and location
 *  (mode.ts `classifyRemote`, #576), where a list that offers remote among other places ("San Francisco, CA, or
 *  Remote within Canada") counts as remote too: the person can take it remote. */
export function isRemoteJob(j: Job): boolean {
  if (j.mode) return j.mode === 'remote';
  const text = `${j.location ?? ''} ${j.label ?? ''}`;
  const c = classifyRemote(text);
  return c.mode === 'remote' || (c.mode === 'unstated' && c.offersRemote);
}

/** The jobs Remote only lets through: what every count on Apply reads (chips, status line, closed
 *  count, pager, All jobs), so counts always follow the active filters (#614). */
export function remoteFiltered(jobs: Job[], remoteOnly?: boolean): Job[] {
  return remoteOnly ? jobs.filter(isRemoteJob) : jobs;
}

/** The jobs a view shows, in its order. */
export function visibleJobs(jobs: Job[], view: PipelineView, now: Date = new Date()): Job[] {
  const needle = view.q.trim().toLowerCase();
  const textMatch = (j: Job) =>
    !needle ||
    [j.label, j.company, j.location, j.note, j.notes, j.contact, j.url].some((f) =>
      (f || '').toLowerCase().includes(needle),
    );
  const sorted = sortJobs(jobs, view.sort, now);
  const ordered =
    view.filter === 'toApply'
      ? closingFirst(sorted)
      : view.filter === 'thisWeek'
        ? soonestFirst(sorted, now)
        : sorted;
  return ordered.filter(
    (j) =>
      matchesFilter(j, view.filter, now) && textMatch(j) && (!view.remoteOnly || isRemoteJob(j)),
  );
}

/** How many filters are on besides the view (#542): the search and Remote only. */
export function filtersOn(view: PipelineView): number {
  return (view.q.trim() ? 1 : 0) + (view.remoteOnly ? 1 : 0);
}

/** How many jobs each view would show, under Remote only when it is on (#614). */
export function filterCounts(
  jobs: Job[],
  now: Date = new Date(),
  remoteOnly = false,
): Record<Filter, number> {
  const pool = remoteFiltered(jobs, remoteOnly);
  return Object.fromEntries(
    VIEWS.map((f) => [f, pool.filter((j) => matchesFilter(j, f, now)).length]),
  ) as Record<Filter, number>;
}

const REMOTE_KEY = 'rjb_apply_remote_only';
/** The stored Remote only choice; false when none or storage is blocked. */
export function storedRemoteOnly(): boolean {
  try {
    return localStorage.getItem(REMOTE_KEY) === '1';
  } catch {
    return false;
  }
}
const withRemote = (): PipelineView =>
  storedRemoteOnly() ? { ...DEFAULT_VIEW, remoteOnly: true } : DEFAULT_VIEW;

const store = createStore<PipelineView>(withRemote(), {
  onSet: (next) => {
    try {
      if (next.remoteOnly) localStorage.setItem(REMOTE_KEY, '1');
      else localStorage.removeItem(REMOTE_KEY);
    } catch {
      // Blocked storage: the switch lasts this page load.
    }
  },
});

export const usePipelineView = store.use;
export const getPipelineView = store.get;
export const setPipelineView = (patch: Partial<PipelineView>) =>
  store.set({ ...store.get(), ...patch });
export const resetPipelineView = () => store.set(withRemote());

/** The nearest job the filter shows before and after `job`, by its place in `order` (every job in
 *  the same sort): where the Apply pager steps from a job the filter hides (#510 review). */
export function nearestShown(job: Job, list: Job[], order: Job[]): { prev?: Job; next?: Job } {
  const shown = new Set(list.map((j) => j.url));
  const at = order.findIndex((j) => j.url === job.url);
  if (at < 0) return { next: list[0] };
  return {
    prev: order
      .slice(0, at)
      .reverse()
      .find((j) => shown.has(j.url)),
    next: order.slice(at + 1).find((j) => shown.has(j.url)),
  };
}
