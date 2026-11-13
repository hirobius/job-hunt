// The job Notes field's save line and its older-note rule (TodosNotes.tsx), kept pure.
import type { Job } from './types';

/** What the line under the field says: nothing until the first edit. */
export type NotesSaveState = 'idle' | 'saving' | 'saved';
export const NOTES_STATUS: Record<NotesSaveState, string> = {
  idle: '',
  saving: 'Saving…',
  saved: 'Saved to this job',
};

/** The older `note` (set when the job was saved) is shown above Notes only when it says something
 *  Notes does not: never when Notes already holds its text (it was copied in, then added to). */
export function olderNoteLine(job: Pick<Job, 'note' | 'notes'>): string | undefined {
  const note = job.note?.trim();
  const notes = job.notes?.trim();
  if (!note || !notes) return undefined;
  return notes.includes(note) ? undefined : note;
}
