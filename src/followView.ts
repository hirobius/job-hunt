// A view change follows the list (#614, Adrian 2026-11-12). When a named view or Remote only
// changes and the open job is not in the new list, the first job the list shows opens in its place
// (in place, no history step); with none, the open job stays at lg (the list says "No jobs
// match") and below lg the page shows the view's empty state instead (`useFollowView` returns true).
// Search typing never moves the job (focus stays in the field), and a job opened from elsewhere is
// kept until the person changes the view.
import { useEffect, useRef, useState } from 'react';
import { jobIdOf } from './store';
import { openJob } from './route';
import { visibleJobs, type PipelineView } from './pipelineView';
import type { Job } from './types';

/** Returns true while the person's last view change left the list empty: the open job is then
 *  not what they picked, so the phone shows the view's empty state in its place. */
export function useFollowView(job: Job | undefined, jobs: Job[], view: PipelineView): boolean {
  const key = `${view.filter}|${!!view.remoteOnly}`;
  const last = useRef(key);
  // Set while rendering (React's "adjust state on a prop change"), not in the effect.
  const [seenKey, setSeenKey] = useState(key);
  const [emptyKey, setEmptyKey] = useState<string | null>(null);
  if (seenKey !== key) {
    setSeenKey(key);
    setEmptyKey(job && visibleJobs(jobs, view).length === 0 ? key : null);
  }
  useEffect(() => {
    if (last.current === key) return;
    last.current = key;
    if (!job) return;
    const shown = visibleJobs(jobs, view);
    if (shown.length === 0 || shown.some((j) => j.url === job.url)) return;
    openJob(jobIdOf(shown[0].url), true);
    // Only a view change moves the job.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return emptyKey === key && visibleJobs(jobs, view).length === 0;
}
