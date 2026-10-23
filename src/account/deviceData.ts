// What this device holds that a sign-in would add to the account (the merge guard, security
// audit). Starter templates, an empty kit and sample jobs are not "data": a fresh device has the
// first two, and sample data is never pushed.
import { emptyBlob, type SyncData } from '../syncBlob';
import { isSample } from '../demo/isSample';

const starterSnippet = (id: string) => id.startsWith('tpl-');
const starterDocument = (id: string) => id.startsWith('snippet-tpl-');
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
    d.documents.some((x) => !starterDocument(x.id)) ||
    JSON.stringify(d.kit) !== JSON.stringify(emptyBlob().kit) ||
    d.evidence.trim() !== '' ||
    d.triage.dismissed.length > 0 ||
    anyList(d.targets) ||
    anyList(d.filters) ||
    anyList(d.dreams) ||
    anyKey(d.modes) ||
    anyKey(d.sweeps) ||
    anyKey(d.mustInclude);
  return { jobs, any };
}

/** The merge question, in plain words. */
export const mergeQuestion = (data: DeviceData, email: string): string =>
  data.jobs > 0
    ? `Add this device's ${data.jobs} job${data.jobs === 1 ? '' : 's'} to ${email}?`
    : `Add this device's saved data to ${email}?`;
