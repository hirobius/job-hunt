// The Pipeline's view state (#130): which status filter, search text and sort order the list is
// showing. It lives here, in memory, instead of inside TrackerView, so the job page's rail shows
// the same jobs the list did and the list is as you left it after opening a job and going Back.
// Pure rules plus one tiny store; nothing is persisted (a reload starts fresh on To apply).
import { createStore } from './createStore';
import { deriveJobState, localDay } from './jobState';
import { isClosed } from './jobDates';
import { sortJobs, type SortKey } from './jobSort';
import type { Job } from './types';

/** The named views (#541, redesign phase 2): the Apply list is walked by view, not by a Status
 *  select. Five named views, then All jobs (every job, set-aside ones too, so none is out of reach). */
export type Filter = 'toApply' | 'followUp' | 'interviewing' | 'applied' | 'closed' | 'all';

export interface PipelineView {
  filter: Filter;
  sort: SortKey;
  q: string;
  /** Apply's "Remote only" switch (Adrian 2026-11-09): only jobs whose mode is remote; an unknown
   *  mode counts as not remote. Kept per device (`rjb_apply_remote_only`), unlike the rest. */
  remoteOnly?: boolean;
}

export const DEFAULT_VIEW: PipelineView = { filter: 'toApply', sort: 'recent', q: '' };

export const FILTER_LABEL: Record<Filter, string> = {
  toApply: 'To apply',
  followUp: 'Follow up',
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
  interviewing: 'In interviews or holding an offer.',
  applied: 'Sent, waiting to hear back.',
  closed: 'Gone from the board or past the closing date. Remove or keep each one.',
  all: 'Every saved job, set-aside ones too.',
};

/** The five named views, in order; All jobs comes after them. */
export const NAMED_VIEWS: Filter[] = ['toApply', 'followUp', 'interviewing', 'applied', 'closed'];
export const VIEWS: Filter[] = [...NAMED_VIEWS, 'all'];

function matchesFilter(j: Job, f: Filter, now: Date): boolean {
  const s = deriveJobState(j, now);
  if (f === 'all') return true;
  if (f === 'closed') return isClosed(j, now);
  if (j.archived) return false;
  if (f === 'toApply') return s.status === 'Saved' && !isClosed(j, now);
  if (f === 'followUp') return s.followUp.due;
  if (f === 'interviewing') return s.status === 'Interviewing' || s.status === 'Offer';
  return s.status === 'Applied';
}

/** To apply's order (#541): a job with a closing day first, soonest first; then the sort's order
 *  (newest by default). Stable, so ties keep the sort's order. */
function closingFirst(jobs: Job[]): Job[] {
  const key = (j: Job) => localDay(j.deadline) ?? '\uffff';
  return [...jobs].sort((a, b) => key(a).localeCompare(key(b)));
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
  return (view.filter === 'toApply' ? closingFirst(sorted) : sorted).filter(
    (j) =>
      matchesFilter(j, view.filter, now) &&
      textMatch(j) &&
      (!view.remoteOnly || j.mode === 'remote'),
  );
}

/** How many jobs each view would show. */
export function filterCounts(jobs: Job[], now: Date = new Date()): Record<Filter, number> {
  return Object.fromEntries(
    VIEWS.map((f) => [f, jobs.filter((j) => matchesFilter(j, f, now)).length]),
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
