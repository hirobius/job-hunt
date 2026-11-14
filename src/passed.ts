// Apply's Passed view (Adrian 2026-11-13): what the person passed on. Jobs marked Not a fit or set
// aside (`archived`, pipelineView `inView(…, 'passed')`) and postings skipped in Find's Review
// (`decided[]` entries with verdict 'skipped', not `hidden`). A Skip keeps the posting's title,
// company and link (feed/decided.ts `decide`); an older Skip has only its fingerprint and lists as
// "Skipped posting" with no link. Every action answers with Undo.
import { decided, type Decided } from './decided';
import { addJobDetailed } from './store';
import { notifyRemoved, notifySaved, removeWithUndo, alreadyInApply } from './saveNotice';
import type { Job } from './types';

/** The skipped postings Passed lists, newest first. */
export function skippedPostings(all: Iterable<Decided>): Decided[] {
  return [...all]
    .filter((d) => d.verdict === 'skipped' && !d.hidden)
    .sort((a, b) => b.at.localeCompare(a.at));
}

/** A skipped posting's title as listed. */
export const skippedTitle = (d: Decided) => d.title || 'Skipped posting';

/** Save a skipped posting as a job (like Review's Save): only one with a link. Undo takes the job
 *  back and puts the Skip back. Returns the saved job's url, or null. */
export function saveSkipped(d: Decided): string | null {
  if (!d.url || alreadyInApply(d.url)) return null;
  const url = addJobDetailed(d.url, { label: d.title, company: d.company });
  if (!url) return null;
  decided.set(d.fingerprint, 'saved');
  notifySaved([url], d.title, [], () => decided.undo(d.fingerprint, d));
  return url;
}

/** Undo skip: the posting is back in Find's Review. Undo skips it again. */
export function undoSkip(d: Decided): void {
  decided.undo(d.fingerprint);
  notifyRemoved(`Back in Find: ${skippedTitle(d)}`, () => decided.undo(d.fingerprint, d));
}

/** Delete a skipped posting from Passed for good: its decision stays (hidden), so it never comes
 *  back in Review. Undo lists it again. */
export function deleteSkipped(d: Decided): void {
  const prev = decided.hide(d.fingerprint);
  if (!prev) return;
  notifyRemoved(
    `Deleted: ${skippedTitle(d)}`,
    () => decided.undo(d.fingerprint, prev),
    'It stays out of Find.',
  );
}

/** Delete a passed job: soft, to Recently removed, with Undo (Delete forever stays there). */
export const deletePassedJob = (job: Job) => removeWithUndo(job);
