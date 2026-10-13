import type { Job } from './types';

/** The one notes text for a job. The model has two fields (`note`, `notes`); the job page shows
 *  only `notes`, and a legacy `note` stands in for it until the first edit moves it across. */
export const notesOf = (job: Job): string => job.notes || job.note || '';
