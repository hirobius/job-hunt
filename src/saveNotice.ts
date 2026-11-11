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
  updateJob,
  type AddOutcome,
} from './store';
import { restoreJob, trashJob } from './trash';
import { titleOf } from './jobRow';
import type { Job } from './types';
import { getRoute, navigate, openJob, parseHash, withOrigin } from './route';

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

/** Open modal lists that show notices themselves (the All jobs sheet): while one is open, every
 *  notice is `inDialog`, so its Undo stays in reach (the toast behind a modal is not). */
let dialogHosts = 0;
export function noticeHost(delta: 1 | -1) {
  dialogHosts = Math.max(0, dialogHosts + delta);
  if (delta < 0) noticeToToast();
}

export function showNotice(n: Omit<Notice, 'id'>) {
  watchForStale();
  store.set({
    ...n,
    ...(dialogHosts > 0 && !n.inDialog ? { inDialog: true as const } : {}),
    id: ++seq,
  });
}
export const dismissNotice = () => store.set(null);
export const useNotice = store.use;

/** A dialog closed: a notice it was showing moves to the toast, so its Undo stays in reach. */
export function noticeToToast() {
  const n = store.get();
  if (n?.inDialog) store.set({ ...n, inDialog: undefined });
}

// A save notice is stale once its jobs left Saved (its "To apply" is no longer true,
// and Undo would keep them anyway, #219; one job marked applied while the toast covers the form).
// A bulk save keeps its notice while any of its jobs is still to apply. Other notices (Removed,
// Not a fit) are raised as their view navigates away, so they stay. Watching starts with the
// first notice.
let watching = false;
function watchForStale() {
  if (watching) return;
  watching = true;
  // Undo toasts survive navigation for their full timeout (#534, interaction review
  // 2026-11-11): a route change no longer closes a save notice.
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

/** Say where newly saved jobs went: "Added to Apply: <title>", Open, Undo: one line, with no
 *  job name under it (rev-3 #s-save-notice; Open is one tap away). `urls` are the
 *  stored URLs of jobs this save added (already-saved ones are left out by the caller); those in
 *  `restored` were set aside before, so Undo sets them aside again instead of removing them. Undo
 *  never removes a job the user has moved past Saved since (#219). */
export function notifySaved(
  urls: string[],
  label?: string,
  restored: string[] = [],
  /** Also run on Undo (Review new: the save's follow is taken back too). */
  onUndo?: () => void,
) {
  if (!urls.length) return;
  const one = urls.length === 1;
  const savedOn = getRoute();
  const undo = {
    label: 'Undo',
    run: () => {
      urls.forEach((u) => {
        if (restored.includes(u)) updateJob(u, { archived: true });
        else if (findJobByUrl(u)?.status === 'Saved') removeJob(u);
      });
      onUndo?.();
    },
  };
  const open = {
    label: 'Open',
    // The job page remembers the page the save was made on (Companies' tool or section, Live
    // postings), so its Back returns there (return paths).
    run: () =>
      one
        ? navigate(withOrigin({ tab: 'apply', jobId: jobIdOf(urls[0]) }, savedOn))
        : navigate({ tab: 'apply', sub: null }),
  };
  showNotice({
    // One word for one thing (#534): the key says Save, the toast says where it went.
    title: one ? `Added to Apply${label ? `: ${label}` : ''}` : `Added ${urls.length} to Apply`,
    tone: 'success',
    jobUrls: urls,
    // #534: "Added to Apply: <title>", Open and Undo (Open stays, review 2026-11-11).
    actions: [open, undo],
  });
}

/** A quick-add link (?add=) whose link is not one a job can be saved under. */
export const QUICK_ADD_INVALID = 'That quick-add link has no job link in it, so nothing was saved.';

/** A quick-add link (?status=) whose status is not one of STATUSES. */
export const quickAddBadStatus = (status: string) =>
  `That quick-add link’s “${status}” is not a status, so nothing was saved.`;

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
  // #534: Apply is the one saved list; Remove takes a job off it (to Recently removed).
  notifyRemoved(`Removed from Apply: ${titleOf(job)}`, () => {
    restoreWithNotice(job.url);
    if (reopen) {
      const r = parseHash(reopen);
      navigate({ ...r, from: r.from ?? null, section: r.section ?? null }, false, {
        restore: true,
      });
    }
  });
}

/** True when this link is already a job in Apply (not set aside): Save then does nothing (#534). */
export function alreadyInApply(url: string): boolean {
  const j = findJobByUrl(url);
  return !!j && !j.archived;
}
