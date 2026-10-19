// "Where did my save go?" (rapid apply): every save says it landed in the Pipeline's To apply
// queue, with Open and Undo. A Remove says so too, with Undo (Recently removed, trash.ts). One
// notice at a time, so they never stack; any view raises it through `notifySaved` /
// `removeWithUndo` / `showNotice`, and the shell renders it once (NoticeHost.tsx).
import { createStore } from './createStore';
import { jobIdOf, removeJob } from './store';
import { restoreJob, trashJob } from './trash';
import { titleOf } from './jobRow';
import type { Job } from './types';
import { navigate, openJob } from './route';

export interface NoticeAction {
  label: string;
  run: () => void;
}
export interface Notice {
  id: number;
  title: string;
  description?: string;
  actions: NoticeAction[];
}

const store = createStore<Notice | null>(null);
let seq = 0;

export function showNotice(n: Omit<Notice, 'id'>) {
  store.set({ ...n, id: ++seq });
}
export const dismissNotice = () => store.set(null);
export const useNotice = store.use;

/** Say where newly saved jobs went: "Saved to Pipeline · To apply", Open, Undo. `urls` are the
 *  stored URLs of jobs this save added (already-saved ones are left out by the caller). */
export function notifySaved(urls: string[], label?: string) {
  if (!urls.length) return;
  const one = urls.length === 1;
  showNotice({
    title: one ? 'Saved to Pipeline · To apply' : `Saved ${urls.length} to Pipeline · To apply`,
    description: one ? label : undefined,
    actions: [
      {
        label: 'Open',
        run: () => (one ? openJob(jobIdOf(urls[0])) : navigate({ tab: 'queue', sub: null })),
      },
      { label: 'Undo', run: () => urls.forEach(removeJob) },
    ],
  });
}

/** Put a removed job back and say what happened: back in the Pipeline, or folded into the copy
 *  saved since (restoreJob never drops either copy). */
export function restoreWithNotice(url: string) {
  const outcome = restoreJob(url);
  if (outcome === 'merged')
    showNotice({
      title: 'Merged into the saved copy',
      description:
        'This posting was saved again, so its notes, to-dos and interviews were added there.',
      actions: [{ label: 'Open', run: () => openJob(jobIdOf(url)) }],
    });
}

/** Remove a job to Recently removed, with Undo. */
export function removeWithUndo(job: Job) {
  trashJob(job.url);
  showNotice({
    title: `Removed “${titleOf(job)}”`,
    actions: [{ label: 'Undo', run: () => restoreWithNotice(job.url) }],
  });
}
