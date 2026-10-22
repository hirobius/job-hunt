// What this device holds that a sign-in would add to the account (the merge guard, security
// audit). Starter templates and an empty kit are not "data": every fresh device has them.
import { emptyBlob, type SyncData } from '../syncBlob';

const starterSnippet = (id: string) => id.startsWith('tpl-');
const starterDocument = (id: string) => id.startsWith('snippet-tpl-');
const anyList = (m: Record<string, unknown[]>) => Object.values(m).some((l) => l.length > 0);

export interface DeviceData {
  jobs: number;
  /** Anything at all worth asking about (jobs, documents, the kit, tracks, …). */
  any: boolean;
}

export function deviceData(d: SyncData, tracks: number): DeviceData {
  const any =
    d.jobs.length > 0 ||
    d.trash.length > 0 ||
    tracks > 0 ||
    d.copydeck.some((s) => !starterSnippet(s.id)) ||
    d.documents.some((x) => !starterDocument(x.id)) ||
    JSON.stringify(d.kit) !== JSON.stringify(emptyBlob().kit) ||
    d.evidence.trim() !== '' ||
    d.triage.dismissed.length > 0 ||
    anyList(d.targets) ||
    anyList(d.filters) ||
    anyList(d.dreams);
  return { jobs: d.jobs.length, any };
}

/** The merge question, in plain words. */
export const mergeQuestion = (data: DeviceData, email: string): string =>
  data.jobs > 0
    ? `Add this device's ${data.jobs} job${data.jobs === 1 ? '' : 's'} to ${email}?`
    : `Add this device's saved data to ${email}?`;
