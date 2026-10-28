// "Where did my save go?" (rapid apply): every save says it landed in the Pipeline's To apply
// queue, with Open and Undo. A Remove says so too, with Undo (a job goes to Recently removed,
// trash.ts; a to-do, an interview, an outreach target, a final copy, a track's link or section is
// put back in its place). One notice at a
// time, so they never stack; any view raises it through `notifySaved` / `removeWithUndo` /
// `notifyRemoved` / `showNotice`, and the shell renders it once (NoticeHost.tsx).
import { createStore } from './createStore';
import {
  addJobOutcome,
  findJobByUrl,
  getAllJobs,
  subscribeJobs,
  jobIdOf,
  removeJob,
  setStatusByUrl,
  updateJob,
  type AddOutcome,
} from './store';
import { restoreJob, trashJob } from './trash';
import { titleOf } from './jobRow';
import type { Job, Status } from './types';
import {
  buildHash,
  getRoute,
  navigate,
  openJob,
  parseHash,
  subscribeRoute,
  withOrigin,
} from './route';

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
  /** The saved jobs this notice is about: it goes once one leaves Saved or is gone. */
  jobUrls?: string[];
  /** Raised inside a modal dialog: the dialog shows it (DialogNotice), not the toast, which the
   *  dialog would hide from a screen reader and the keyboard. It turns into the toast when the
   *  dialog closes (`noticeToToast`). */
  inDialog?: true;
}

const store = createStore<Notice | null>(null);
let seq = 0;
/** The route the notice was raised on: any move away from it makes the notice stale. */
let shownOn = '';

export function showNotice(n: Omit<Notice, 'id'>) {
  watchForStale();
  shownOn = buildHash(getRoute());
  store.set({ ...n, id: ++seq });
}
export const dismissNotice = () => store.set(null);
export const useNotice = store.use;

/** A dialog closed: a notice it was showing moves to the toast, so its Undo stays in reach. */
export function noticeToToast() {
  const n = store.get();
  if (n?.inDialog) store.set({ ...n, inDialog: undefined });
}

// A save notice is stale once the user has moved on: they navigated (its Open points at a page
// they already chose, or away from it), or its jobs left Saved (its "To apply" is no longer true,
// and Undo would keep them anyway, #219; one job marked applied while the toast covers the form).
// A bulk save keeps its notice while any of its jobs is still to apply. Other notices (Removed,
// Not a fit) are raised as their view navigates away, so they stay. Watching starts with the
// first notice.
let watching = false;
function watchForStale() {
  if (watching) return;
  watching = true;
  subscribeRoute(() => {
    if (store.get()?.jobUrls?.length && buildHash(getRoute()) !== shownOn) dismissNotice();
  });
  subscribeJobs(() => {
    const urls = store.get()?.jobUrls;
    if (!urls?.length) return;
    const jobs = getAllJobs();
    const allMoved = urls.every((u) => {
      const j = jobs.find((x) => x.url === u);
      return !j || j.status !== 'Saved' || j.archived;
    });
    if (allMoved) dismissNotice();
  });
}

/** Say where newly saved jobs went: "Saved to Pipeline · To apply", Open, Undo: one line, with no
 *  job name under it (rev-3 #s-save-notice; Open is one tap away). `urls` are the
 *  stored URLs of jobs this save added (already-saved ones are left out by the caller); those in
 *  `restored` were set aside before, so Undo sets them aside again instead of removing them. Undo
 *  never removes a job the user has moved past Saved since (#219). */
export function notifySaved(urls: string[], _label?: string, restored: string[] = []) {
  if (!urls.length) return;
  const one = urls.length === 1;
  const savedOn = getRoute();
  showNotice({
    title: one ? 'Saved to Pipeline · To apply' : `Saved ${urls.length} to Pipeline · To apply`,
    tone: 'success',
    jobUrls: urls,
    actions: [
      {
        label: 'Open',
        // The job page remembers the page the save was made on (Companies' tool or section, Live
        // postings), so its Back returns there (return paths).
        run: () =>
          one
            ? navigate(withOrigin({ tab: 'queue', jobId: jobIdOf(urls[0]) }, savedOn))
            : navigate({ tab: 'queue', sub: null }),
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

/** A quick-add link (?add=) whose link is not one a job can be saved under. */
export const QUICK_ADD_INVALID = 'That quick-add link has no job link in it, so nothing was saved.';

/** A quick-add link (?status=) whose status is not one of STATUSES. */
export const quickAddBadStatus = (status: string) =>
  `That quick-add link’s “${status}” is not a status, so nothing was saved.`;

/** A quick-add link that sets a status (?applied=, ?status=&u=): save it if new, set the status
 *  and say so ("Marked applied", "Set to Interviewing") with Open. False when the link is not one
 *  a job can be saved under (the caller explains). */
export function setStatusWithNotice(rawUrl: string, status: Status, label?: string): boolean {
  setStatusByUrl(rawUrl, status, label);
  const job = findJobByUrl(rawUrl);
  if (!job) return false;
  showNotice({
    title: status === 'Applied' ? 'Marked applied' : `Set to ${status}`,
    description: titleOf(job),
    tone: 'success',
    actions: [{ label: 'Open', run: () => openJob(jobIdOf(job.url)) }],
  });
  return true;
}

/** Quick-save a link and say what happened: it landed in To apply (a new job, or a set-aside one
 *  brought back, #219), or it was already in the Pipeline (with Open, so a second paste, a tile
 *  or a quick-add link never ends in silence). Returns what the save did; 'invalid' is the
 *  caller's to explain, next to the field it came from. */
export function saveWithNotice(rawUrl: string, label?: string, note?: string): AddOutcome {
  const out = addJobOutcome(rawUrl, label, note);
  const job = out === 'invalid' ? undefined : findJobByUrl(rawUrl);
  if (!job) return out;
  if (out === 'exists')
    showNotice({
      title: 'Already in your Pipeline',
      description: titleOf(job),
      actions: [{ label: 'Open', run: () => openJob(jobIdOf(job.url)) }],
    });
  else notifySaved([job.url], label || job.label, out === 'restored' ? [job.url] : []);
  return out;
}

/** Put a removed job back and say what happened: back in the Pipeline, or folded into the copy
 *  saved since (restoreJob never drops either copy). */
export function restoreWithNotice(url: string, opts: { inDialog?: boolean } = {}) {
  const outcome = restoreJob(url);
  if (outcome === 'merged')
    showNotice({
      ...(opts.inDialog ? { inDialog: true as const } : {}),
      title: 'Merged into the saved copy',
      description: 'This posting was saved again, so what the removed copy held was added there.',
      actions: [{ label: 'Open', run: () => openJob(jobIdOf(url)) }],
    });
}

/** Say something was removed, with Undo putting it back (#212): a job, a to-do, an interview, an
 *  outreach target, a final copy, a track's link or section. The caller has already removed it
 *  (after its row collapsed). `inDialog`: raised inside a modal dialog (see Notice.inDialog). */
export function notifyRemoved(
  title: string,
  undo: () => void,
  description?: string,
  opts: { inDialog?: boolean } = {},
) {
  showNotice({
    title,
    description,
    actions: [{ label: 'Undo', run: undo }],
    ...(opts.inDialog ? { inDialog: true as const } : {}),
  });
}

/** Remove a job to Recently removed, with Undo. Removed from its own page (`reopen`, that page's
 *  hash), Undo also reopens the page as it was: its section, its origin, its scroll. */
export function removeWithUndo(job: Job, reopen?: string) {
  trashJob(job.url);
  notifyRemoved(`Removed “${titleOf(job)}”`, () => {
    restoreWithNotice(job.url);
    if (reopen) {
      const r = parseHash(reopen);
      navigate({ ...r, from: r.from ?? null, section: r.section ?? null }, false, {
        restore: true,
      });
    }
  });
}
