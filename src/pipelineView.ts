// The Pipeline's view state (#130): which status filter, search text and sort order the list is
// showing. It lives here, in memory, instead of inside TrackerView, so the job page's rail shows
// the same jobs the list did and the list is as you left it after opening a job and going Back.
// Pure rules plus one tiny store; nothing is persisted (a reload starts fresh on Active).
import { createStore } from './createStore';
import { deriveJobState } from './jobState';
import { isClosed, isClosingSoon } from './jobDates';
import { sortJobs, type SortKey } from './jobSort';
import type { Job, Status } from './types';

export type Filter = 'active' | 'starred' | 'all' | Status | 'retired' | 'closingSoon' | 'closed';

export interface PipelineView {
  filter: Filter;
  sort: SortKey;
  q: string;
  /** Apply's "Remote only" switch (Adrian 2026-11-09): only jobs whose mode is remote; an unknown
   *  mode counts as not remote. Kept per device (`rjb_apply_remote_only`), unlike the rest. */
  remoteOnly?: boolean;
}

export const DEFAULT_VIEW: PipelineView = { filter: 'active', sort: 'recent', q: '' };

// The status menu (#129): two views, then the stages grouped by where a job is.
export const FILTER_LABEL: Record<Filter, string> = {
  active: 'Active',
  starred: 'Starred',
  all: 'All',
  Saved: 'Saved',
  Applied: 'Applied',
  Interviewing: 'Interviewing',
  Offer: 'Offer',
  Rejected: 'Rejected',
  retired: 'Retired',
  closingSoon: 'Closing soon',
  closed: 'Closed',
};

// Active first; All and Retired demoted to the end (#129). A group without a label is just a
// separated section.
export const FILTER_GROUPS: { label?: string; items: Filter[] }[] = [
  // Starred is where favourites live: every starred job, whatever its stage.
  { label: 'Views', items: ['active', 'starred'] },
  { label: 'In progress', items: ['Saved', 'Applied', 'Interviewing', 'Offer'] },
  // By closing date (#419): closes within 7 days, or gone from its board / past its day.
  { label: 'Closing date', items: ['closingSoon', 'closed'] },
  // Was "Closed"; renamed so it doesn't read as the Closed (closing date) filter (#419).
  { label: 'Ended', items: ['Rejected', 'retired'] },
  { items: ['all'] },
];

function matchesFilter(j: Job, f: Filter): boolean {
  const s = deriveJobState(j);
  if (f === 'active') return s.isActive;
  if (f === 'all') return true;
  if (f === 'starred') return !!j.priority;
  if (f === 'retired') return !!j.archived;
  if (f === 'closingSoon') return isClosingSoon(j);
  if (f === 'closed') return isClosed(j);
  return !j.archived && s.status === f;
}

/** The jobs a view shows, in its order. */
export function visibleJobs(jobs: Job[], view: PipelineView): Job[] {
  const needle = view.q.trim().toLowerCase();
  const textMatch = (j: Job) =>
    !needle ||
    [j.label, j.company, j.location, j.note, j.notes, j.contact, j.url].some((f) =>
      (f || '').toLowerCase().includes(needle),
    );
  return sortJobs(jobs, view.sort).filter(
    (j) =>
      matchesFilter(j, view.filter) && textMatch(j) && (!view.remoteOnly || j.mode === 'remote'),
  );
}

/** How many jobs each filter would show. */
export function filterCounts(jobs: Job[]): Record<Filter, number> {
  return Object.fromEntries(
    FILTER_GROUPS.flatMap((g) => g.items).map((f) => [
      f,
      jobs.filter((j) => matchesFilter(j, f)).length,
    ]),
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
