// Load / clear the "Try with sample data" pipeline (#107). The policy is two pure functions —
// seed only an EMPTY tracker, and clear exactly the `demo: true` records — with thin adapters
// over the jobs store. Nothing here can overwrite or remove a record the user made.
// No sample track: every user has the design-systems Search profile (Adrian 2026-10-29), so the
// sample is jobs only. An older device's Sample track is still dropped on sign-in (sampleTrack.ts).
import type { Job } from '../types';
import { getAllJobs, replaceAll } from '../store';
import { withoutSample } from './isSample';
import { sampleJobs } from './sampleData';

export { withoutSample };
// The Pipeline's sample controls read only these, apart from the starter pack (#372).
export { clearSample, hasCloudSession } from './sampleSession';

/** The sample to store, or null when the tracker holds anything at all (archived included). */
export function seedIfEmpty(existing: Job[], sample: Job[]): Job[] | null {
  return existing.length === 0 ? sample : null;
}

/** Seed the sample into an empty tracker. Returns false (and changes nothing) otherwise. */
export function loadSample(now: Date = new Date()): boolean {
  const next = seedIfEmpty(getAllJobs(), sampleJobs(now));
  if (!next) return false;
  replaceAll(next);
  return true;
}
