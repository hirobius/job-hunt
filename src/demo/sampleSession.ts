// The sample data's light half (#107): whether it may be offered, and Clear. Apart from
// loadSample.ts, which seeds a starter pack, so the Pipeline's chunk doesn't carry the packs (#372).
import { getAllJobs, replaceAll } from '../store';
import { withoutSample } from './isSample';
import { dropSampleTrack } from './sampleTrack';

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
