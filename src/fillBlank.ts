// Filling one blank of a template from where it shows (rev-3 item A): a chip tapped in an Apply
// mode template or kit letter saves its value where the editor's Variables panel saves it. The
// four job variables go on the job (so every message for it fills), anything else on the message's
// own values (`Document.values`).
import { getAllDocuments, setDocumentValues } from './documents';
import { updateJob } from './store';
import { ownValue } from './templateFill';
import type { Job } from './types';

/** The variables a job fills, and the job field each one is saved to. */
export const JOB_FIELD: Record<string, 'company' | 'label' | 'contact' | 'angle'> = {
  company: 'company',
  role: 'label',
  contact: 'contact',
  angle: 'angle',
};

/** Whether a blank named `name` saves on the job (else on the message). */
export const savesOnJob = (name: string) => !!ownValue(JOB_FIELD, name.trim().toLowerCase());

/** Save a blank's value: on the job for its four fields, else on the message's own values. */
export function fillBlank(name: string, value: string, job: Job, documentId: string) {
  const key = name.trim().toLowerCase();
  const v = value.trim();
  if (!key || !v) return;
  const field = ownValue(JOB_FIELD, key) as (typeof JOB_FIELD)[string] | undefined;
  if (field) return updateJob(job.url, { [field]: v } as Partial<Job>);
  const doc = getAllDocuments().find((d) => d.id === documentId);
  if (!doc) return;
  const rest = Object.entries(doc.values ?? {}).filter(([k]) => k !== key);
  setDocumentValues(documentId, Object.fromEntries([...rest, [key, v]]));
}
