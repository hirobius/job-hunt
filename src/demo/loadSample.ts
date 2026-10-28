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
import { rememberSampleTrack } from './sampleTrack';
import { sampleJobs } from './sampleData';

export { withoutSample };
// The Pipeline's sample controls read only these, apart from the starter pack (#372).
export { clearSample, hasCloudSession } from './sampleSession';

/** The sample to store, or null when the tracker holds anything at all (archived included). */
export function seedIfEmpty(existing: Job[], sample: Job[]): Job[] | null {
  return existing.length === 0 ? sample : null;
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
