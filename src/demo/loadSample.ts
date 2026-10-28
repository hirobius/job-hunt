// Load / clear the "Try with sample data" pipeline (#107). The policy is two pure functions —
// seed only an EMPTY tracker, and clear exactly the `demo: true` records — with thin adapters
// over the jobs store. Nothing here can overwrite or remove a record the user made.
// A board with no tracks also gets one "Sample" track from the first starter pack, so Companies
// (and the Pipeline's Find the next company) has something to show; Clear removes it by id.
import type { Job } from '../types';
import { getAllJobs, replaceAll } from '../store';
import { getCurationState } from '../curation/curationStore';
import { seedPack, STARTER_PACKS } from '../curation/starterPacks';
import { withoutSample } from './isSample';
import { dropSampleTrack, rememberSampleTrack } from './sampleTrack';
import { sampleJobs } from './sampleData';

export { withoutSample };

/** The sample to store, or null when the tracker holds anything at all (archived included). */
export function seedIfEmpty(existing: Job[], sample: Job[]): Job[] | null {
  return existing.length === 0 ? sample : null;
}

/** Whether a Supabase session is stored in this browser. The sample is never offered then: a
 *  signed-in tracker syncs, and its cloud pull may not have landed yet, so an "empty" tracker
 *  isn't really empty and seeded records would merge into the account. Reads the persisted
 *  auth key (`sb-<ref>-auth-token`) directly so the demo needs no hook into CloudSync. */
export function hasCloudSession(storage: Pick<Storage, 'length' | 'key'> = localStorage): boolean {
  try {
    for (let i = 0; i < storage.length; i++) {
      if (/^sb-.+-auth-token$/.test(storage.key(i) ?? '')) return true;
    }
  } catch {
    /* storage unavailable → treat as signed out */
  }
  return false;
}

export const SAMPLE_TRACK_LABEL = 'Sample';

/** Seed the sample into an empty tracker. Returns false (and changes nothing) otherwise. */
export function loadSample(now: Date = new Date()): boolean {
  const next = seedIfEmpty(getAllJobs(), sampleJobs(now));
  if (!next) return false;
  replaceAll(next);
  if (getCurationState().categories.length === 0) {
    const id = seedPack(STARTER_PACKS[0].id, undefined, { label: SAMPLE_TRACK_LABEL });
    rememberSampleTrack(id);
  }
  return true;
}

/** Remove the sample records (and the Sample track); returns how many jobs were removed. Real
 *  records are untouched. */
export function clearSample(): number {
  dropSampleTrack();
  const jobs = getAllJobs();
  const kept = withoutSample(jobs);
  if (kept.length === jobs.length) return 0;
  replaceAll(kept);
  return jobs.length - kept.length;
}
