// What this device holds that a sign-in would add to the account (the merge guard, security
// audit): only what the person made. Not data: sample jobs (marked, never pushed), starter
// messages and documents left as they came, an empty kit, the auto profile (also once re-saved
// unchanged, profile.ts keepAuto) and its starter companies, the keyless feeds, and the v11 work
// modes and sweep titles (no editor writes them since #389; a fresh device asking about them
// would be noise).
import { emptyBlob, type SyncData } from '../syncBlob';
import { isSample } from '../demo/isSample';
import { untouchedAuto } from '../autoSetup';

const starterSnippet = (id: string) => id.startsWith('tpl-');
/** A starter document as it came: one Version, no values, not pinned or tied to a job. */
const starterDocument = (x: SyncData['documents'][number]) =>
  x.id.startsWith('snippet-tpl-') &&
  x.versions.length <= 1 &&
  !x.pinned &&
  !x.jobUrl &&
  !x.company &&
  !Object.values(x.values ?? {}).some((v) => v.trim() !== '');
const anyList = (m: Record<string, unknown[]>) => Object.values(m).some((l) => l.length > 0);
const anyKey = (m: Record<string, unknown>) => Object.keys(m).length > 0;

export interface DeviceData {
  jobs: number;
  /** Anything at all worth asking about (jobs, documents, the kit, tracks, …). */
  any: boolean;
}

export function deviceData(d: SyncData, tracks: number): DeviceData {
  const jobs = d.jobs.filter((j) => !isSample(j)).length;
  const any =
    jobs > 0 ||
    d.trash.some((r) => !isSample(r.job)) ||
    tracks > 0 ||
    d.copydeck.some((s) => !starterSnippet(s.id)) ||
    d.documents.some((x) => !starterDocument(x)) ||
    JSON.stringify(d.kit) !== JSON.stringify(emptyBlob().kit) ||
    d.evidence.trim() !== '' ||
    d.triage.dismissed.length > 0 ||
    anyList(d.targets) ||
    anyList(d.filters) ||
    anyList(d.dreams) ||
    anyKey(d.mustInclude) ||
    // The auto profile, its starter companies and the keyless feeds are not the person's.
    d.profiles.some((p) => !p.auto) ||
    d.sources.some((s) => s.kind !== 'feed' && !untouchedAuto(s)) ||
    d.decided.length > 0;
  return { jobs, any };
}

/** The merge question, in plain words. */
export const mergeQuestion = (data: DeviceData, email: string): string =>
  data.jobs > 0
    ? `Add this device's ${data.jobs} job${data.jobs === 1 ? '' : 's'} to ${email}?`
    : `Add this device's saved data to ${email}?`;
