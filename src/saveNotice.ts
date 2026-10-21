// "Where did my save go?" (rapid apply): every save says it landed in the Pipeline's To apply
// queue, with Open and Undo. A Remove says so too, with Undo (Recently removed, trash.ts). One
// notice at a time, so they never stack; any view raises it through `notifySaved` /
// `removeWithUndo` / `showNotice`, and the shell renders it once (NoticeHost.tsx).
import { createStore } from './createStore';
import {
  addJobOutcome,
  findJobByUrl,
  jobIdOf,
  removeJob,
  updateJob,
  type AddOutcome,
} from './store';
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
  /** The toast's icon tone; a save is a success (a check, not the info glyph). */
  tone?: 'success';
  actions: NoticeAction[];
}

const store = createStore<Notice | null>(null);
let seq = 0;

export function showNotice(n: Omit<Notice, 'id'>) {
  store.set({ ...n, id: ++seq });
}
export const dismissNotice = () => store.set(null);
export const useNotice = store.use;

/** Say where newly saved jobs went: "Saved to Pipeline · To apply", Open, Undo: one line, with no
 *  job name under it (rev-3 #s-save-notice; Open is one tap away). `urls` are the
 *  stored URLs of jobs this save added (already-saved ones are left out by the caller); those in
 *  `restored` were set aside before, so Undo sets them aside again instead of removing them. Undo
 *  never removes a job the user has moved past Saved since (#219). */
export function notifySaved(urls: string[], _label?: string, restored: string[] = []) {
  if (!urls.length) return;
  const one = urls.length === 1;
  showNotice({
    title: one ? 'Saved to Pipeline · To apply' : `Saved ${urls.length} to Pipeline · To apply`,
    tone: 'success',
    actions: [
      {
        label: 'Open',
        run: () => (one ? openJob(jobIdOf(urls[0])) : navigate({ tab: 'queue', sub: null })),
      },
      {
        label: 'Undo',
        run: () =>
          urls.forEach((u) => {
            if (restored.includes(u)) updateJob(u, { archived: true });
            else if (findJobByUrl(u)?.status === 'Saved') removeJob(u);
          }),
      },
    ],
  });
}

/** Quick-save a link and say so when it landed in To apply: a new job or a set-aside one brought
 *  back (#219). Returns what the save did. */
export function saveWithNotice(rawUrl: string, label?: string, note?: string): AddOutcome {
  const out = addJobOutcome(rawUrl, label, note);
  const job = out === 'added' || out === 'restored' ? findJobByUrl(rawUrl) : undefined;
  if (job) notifySaved([job.url], label || job.label, out === 'restored' ? [job.url] : []);
  return out;
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
