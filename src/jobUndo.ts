// Job changes that say so with Undo (#212): Mark applied, a status, Retire. Shared by the Pipeline's
// rows, the job page and Apply mode, outside the components so Fast Refresh keeps working.
import { flashRow } from './feedback';
import { titleOf } from './jobRow';
import { showNotice } from './saveNotice';
import { getAllJobs, updateJob } from './store';
import type { Job } from './types';

/** Change a job and say so, with Undo putting back the fields the change touched (#212). A row
 *  the change keeps in the list flashes; one it filters out leaves the notice behind. */
export function changeWithUndo(job: Job, title: string, change: () => void, from: Element | null) {
  change();
  flashRow(from);
  showNotice({
    title,
    description: titleOf(job),
    actions: [{ label: 'Undo', run: () => updateJob(job.url, undoPatch(job)) }],
  });
}

/** A patch that puts a job back as it was: every field it had, and the ones it gained cleared. */
function undoPatch(before: Job): Partial<Job> {
  const now = getAllJobs().find((j) => j.url === before.url);
  const patch: Partial<Job> = { ...before };
  for (const k of Object.keys(now ?? {}) as (keyof Job)[])
    if (!(k in before)) (patch as Record<string, unknown>)[k] = undefined;
  return patch;
}
