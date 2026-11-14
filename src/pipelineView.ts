// The Apply list's view state (#130): which named view the list is showing. It lives here, in
// memory, instead of inside TrackerView, so the job page's rail shows the same jobs the list did
// and the list is as you left it after opening a job and going Back. Pure rules plus one tiny
// store; nothing is persisted (a reload starts fresh on To apply). Since the control-free list
// (Adrian 2026-11-13) there is no search, no sort (newest first, To apply closing soonest first)
// and no Remote only switch: Remote only follows the Search profile's work mode, as Review does,
// and the old `rjb_apply_remote_only` key is left unread.
import { createStore } from './createStore';
import { deriveJobState, localDay } from './jobState';
import { isClosed } from './jobDates';
import { respondByJobs, upcomingEvents } from './jobEvents';
import { sortJobs } from './jobSort';
import { getProfile, useProfile } from './profile';
import { classifyRemote } from './feed/mode';
import type { Job } from './types';

/** The named views (#541, redesign phase 2): the Apply list is walked by view, not by a Status
 *  select. Seven named views, then All jobs (every job, set-aside ones too, so none is out of reach).
 *  This week (#640) holds what the phone's Next 7 days section did: interviews and closing dates.
 *  Passed (Adrian 2026-11-13) holds the jobs marked Not a fit or set aside, and Review's skipped
 *  postings (passed.ts). */
export type Filter =
  'toApply' | 'followUp' | 'thisWeek' | 'interviewing' | 'applied' | 'closed' | 'passed' | 'all';

export interface PipelineView {
  filter: Filter;
  /** Only remote jobs (`isRemoteJob`: the mode, else the title and location, #614): on when the
   *  Search profile's work mode is remote (usePipelineView / getPipelineView fill it in). */
  remoteOnly?: boolean;
}

export const DEFAULT_VIEW: PipelineView = { filter: 'toApply' };

export const FILTER_LABEL: Record<Filter, string> = {
  toApply: 'To apply',
  followUp: 'Follow up',
  thisWeek: 'This week',
  interviewing: 'Interviewing',
  applied: 'Applied',
  // #602: closed jobs collect here, where the person removes or keeps each one.
  closed: 'Recently closed',
  passed: 'Passed',
  all: 'All jobs',
};

/** The seven named views, in order; All jobs comes after them. */
export const NAMED_VIEWS: Filter[] = [
  'toApply',
  'followUp',
  'thisWeek',
  'interviewing',
  'applied',
  'closed',
  'passed',
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
  // Passed: Not a fit and every other set-aside job (`archived`).
  if (f === 'passed') return !!j.archived;
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

/** What Remote only keeps on Apply, Review's rule (autoScan `remoteOnly`): a remote job, and one
 *  that says nothing about where it is (no mode, no place: "Remote not stated"). A job with a
 *  place or a mode that is not remote drops. */
export function keptUnderRemote(j: Job): boolean {
  if (isRemoteJob(j)) return true;
  if (j.mode) return false;
  const c = classifyRemote(`${j.location ?? ''} ${j.label ?? ''}`);
  return c.mode === 'unstated' && !(j.location ?? '').trim();
}

/** The jobs Remote only lets through: what every count on Apply reads (chips, status line, closed
 *  count, pager, All jobs), so counts always follow the active filters (#614). */
export function remoteFiltered(jobs: Job[], remoteOnly?: boolean): Job[] {
  return remoteOnly ? jobs.filter(keptUnderRemote) : jobs;
}

/** The jobs a view shows, in its order (newest first; To apply and This week by date first). */
export function visibleJobs(jobs: Job[], view: PipelineView, now: Date = new Date()): Job[] {
  const sorted = sortJobs(jobs, 'recent', now);
  const ordered =
    view.filter === 'toApply'
      ? closingFirst(sorted)
      : view.filter === 'thisWeek'
        ? soonestFirst(sorted, now)
        : sorted;
  return ordered.filter(
    (j) => matchesFilter(j, view.filter, now) && (!view.remoteOnly || keptUnderRemote(j)),
  );
}

/** How many rows each view would show, under Remote only when it is on (#614). `skipped` is how
 *  many skipped postings Passed lists beside its jobs (passed.ts `skippedPostings`). */
export function filterCounts(
  jobs: Job[],
  now: Date = new Date(),
  remoteOnly = false,
  skipped = 0,
): Record<Filter, number> {
  const pool = remoteFiltered(jobs, remoteOnly);
  const counts = Object.fromEntries(
    VIEWS.map((f) => [f, pool.filter((j) => matchesFilter(j, f, now)).length]),
  ) as Record<Filter, number>;
  counts.passed += skipped;
  return counts;
}

const store = createStore<PipelineView>(DEFAULT_VIEW);

/** Remote only follows the Search profile's work mode, as Review does. One object per stored
 *  view, so hooks that depend on the view see a stable value. */
const remoteViews = new WeakMap<PipelineView, PipelineView>();
let followProfile = true;
/** Tests only: whether Apply follows the profile's work mode (test/setup turns it off, so a first
 *  run's remote profile landing mid-test does not move the list; remote tests turn it on). */
export function setFollowProfileRemote(on: boolean): void {
  followProfile = on;
}
function withProfile(v: PipelineView, mode: string | undefined): PipelineView {
  if (!followProfile || mode !== 'remote') return v;
  let r = remoteViews.get(v);
  if (!r) remoteViews.set(v, (r = { ...v, remoteOnly: true }));
  return r;
}

export function usePipelineView(): PipelineView {
  return withProfile(store.use(), useProfile()?.mode);
}
export const getPipelineView = (): PipelineView => withProfile(store.get(), getProfile()?.mode);
export const setPipelineView = (patch: Partial<Pick<PipelineView, 'filter'>>) =>
  store.set({ ...store.get(), ...patch });
export const resetPipelineView = () => store.set(DEFAULT_VIEW);

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
