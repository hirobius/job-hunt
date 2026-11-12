// A view change follows the list (#614, Adrian 2026-11-12). When a named view or Remote only
// changes and the open job is not in the new list, the first job the list shows opens in its place
// (in place, no history step); with none, the open job stays and the list says "No jobs match".
// Search typing never moves the job (focus stays in the field), and a job opened from elsewhere is
// kept until the person changes the view.
import { useEffect, useRef } from 'react';
import { jobIdOf } from './store';
import { openJob } from './route';
import { visibleJobs, type PipelineView } from './pipelineView';
import type { Job } from './types';

export function useFollowView(job: Job | undefined, jobs: Job[], view: PipelineView) {
  const key = `${view.filter}|${!!view.remoteOnly}`;
  const last = useRef(key);
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
}
