// The Pipeline's view state (#130): which status filter, search text and sort order the list is
// showing. It lives here, in memory, instead of inside TrackerView, so the job page's rail shows
// the same jobs the list did and the list is as you left it after opening a job and going Back.
// Pure rules plus one tiny store; nothing is persisted (a reload starts fresh on Active).
import { createStore } from './createStore';
import { deriveJobState } from './jobState';
import { sortJobs, type SortKey } from './jobSort';
import type { Job, Status } from './types';

export type Filter = 'active' | 'all' | Status | 'retired';

export interface PipelineView {
  filter: Filter;
  sort: SortKey;
  q: string;
}

export const DEFAULT_VIEW: PipelineView = { filter: 'active', sort: 'recent', q: '' };

// The status menu (#129): two views, then the stages grouped by where a job is.
export const FILTER_LABEL: Record<Filter, string> = {
  active: 'Active',
  all: 'All',
  Saved: 'Saved',
  Applied: 'Applied',
  Interviewing: 'Interviewing',
  Offer: 'Offer',
  Rejected: 'Rejected',
  retired: 'Retired',
};

// Active first; All and Retired demoted to the end (#129). A group without a label is just a
// separated section.
export const FILTER_GROUPS: { label?: string; items: Filter[] }[] = [
  { label: 'Views', items: ['active'] },
  { label: 'In progress', items: ['Saved', 'Applied', 'Interviewing', 'Offer'] },
  { label: 'Closed', items: ['Rejected', 'retired'] },
  { items: ['all'] },
];

export function matchesFilter(j: Job, f: Filter): boolean {
  const s = deriveJobState(j);
  if (f === 'active') return s.isActive;
  if (f === 'all') return true;
  if (f === 'retired') return !!j.archived;
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
  return sortJobs(jobs, view.sort).filter((j) => matchesFilter(j, view.filter) && textMatch(j));
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

const store = createStore<PipelineView>(DEFAULT_VIEW);

export const usePipelineView = store.use;
export const getPipelineView = store.get;
export const setPipelineView = (patch: Partial<PipelineView>) =>
  store.set({ ...store.get(), ...patch });
export const resetPipelineView = () => store.set(DEFAULT_VIEW);
