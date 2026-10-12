// Load / clear the "Try with sample data" pipeline (#107). The policy is two pure functions —
// seed only an EMPTY tracker, and clear exactly the `demo: true` records — with thin adapters
// over the jobs store. Nothing here can overwrite or remove a record the user made.
import type { Job } from '../types';
import { getAllJobs, replaceAll } from '../store';
import { isSample, sampleJobs } from './sampleData';

/** The sample to store, or null when the tracker holds anything at all (archived included). */
export function seedIfEmpty(existing: Job[], sample: Job[]): Job[] | null {
  return existing.length === 0 ? sample : null;
}

/** Every record that isn't sample data, order kept. */
export function withoutSample(jobs: Job[]): Job[] {
  return jobs.filter((j) => !isSample(j));
}

export function hasSample(jobs: Job[]): boolean {
  return jobs.some(isSample);
}

/** Seed the sample into an empty tracker. Returns false (and changes nothing) otherwise. */
export function loadSample(now: Date = new Date()): boolean {
  const next = seedIfEmpty(getAllJobs(), sampleJobs(now));
  if (!next) return false;
  replaceAll(next);
  return true;
}

/** Remove the sample records; returns how many were removed. Real records are untouched. */
export function clearSample(): number {
  const jobs = getAllJobs();
  const kept = withoutSample(jobs);
  if (kept.length === jobs.length) return 0;
  replaceAll(kept);
  return jobs.length - kept.length;
}
