// The sample-data tag (#107). Its own tiny module so the export/sync seams (syncBlob, csv,
// backup) can filter on it without pulling the sample content into the main bundle.
import type { Job } from '../types';

/** True only for records the sample loader created (`demo === true`, nothing looser). */
export function isSample(job: Job): boolean {
  return (job as { demo?: unknown }).demo === true;
}

/** Every record that isn't sample data, order kept. */
export function withoutSample<T extends Job>(jobs: readonly T[]): T[] {
  return jobs.filter((j) => !isSample(j));
}
