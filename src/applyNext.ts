// After Mark applied or Not a fit (#471, #536), the job view moves on to the next job in the Apply
// list, wherever the job was opened from (the walk, Find, a Company page), so focus lands on the
// next job's title. With no next job it goes back to the list (or the page the job was opened
// from), whose heading then takes focus (`focusNewHeading`).
import { getAllJobs, jobIdOf } from './store';
import { getRoute, goBack, navigate, type Route } from './route';
import { getPipelineView, visibleJobs } from './pipelineView';
import type { Job } from './types';

export const APPLY_LIST: Route = { tab: 'apply', sub: null, pillar: null, jobId: null };

/** Open the job after this one in the list as it shows now (else the one before it). Called before
 *  the answer lands, so the job still has its place. In place: Back does not walk every job. */
export function openNextAfter(job: Job, jobs: Job[] = getAllJobs()): void {
  const shown = visibleJobs(jobs, getPipelineView());
  const at = shown.findIndex((j) => j.url === job.url);
  const next = at < 0 ? shown[0] : (shown[at + 1] ?? shown[at - 1]);
  // The last one in the list: back to the list (or wherever the job was opened from).
  if (!next || next.url === job.url) return goBack(APPLY_LIST);
  const { from, section } = getRoute();
  navigate(
    { tab: 'apply', jobId: jobIdOf(next.url), from: from ?? null, section: section ?? null },
    true,
  );
}
