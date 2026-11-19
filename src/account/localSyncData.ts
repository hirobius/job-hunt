// The local side of sync (#814): every synced store on this device, read as one SyncData and
// written back from one. Adding a synced store means one line in each function here (and a blob
// version, data.md). CloudSyncProvider decides when; this module owns which stores.
import { getAllJobs, replaceAll } from '../store';
import { getSnippets, replaceSnippets } from '../copyDeckStore';
import { getTileTriage, replaceTriage } from '../tileTriage';
import { getAllTargets, replaceTargets } from '../feed/targets';
import { getAllFilters, replaceFilters } from '../feed/savedFilters';
import { readEvidence, replaceEvidence } from '../radar/evidenceStore';
import { getAllModes, replaceModes } from '../trackModes';
import { getApplyKit, replaceApplyKit } from '../applyKit';
import { getAllSweeps, replaceSweeps } from '../feed/sweepTitles';
import { getAllMustInclude, replaceMustInclude } from '../feed/mustInclude';
import { getTrash, replaceTrash } from '../trash';
import { getAllDreams, replaceDreams } from '../feed/dreams';
import { getAllDocuments, replaceDocuments } from '../documents';
import { getProfiles, replaceProfiles } from '../profile';
import { getSources, replaceSources } from '../sources';
import { getDecided, replaceDecided } from '../decided';
import { writeBlob, BLOB_VERSION, type SyncData } from '../syncBlob';

/** This device's synced stores, as the blob a push would send. */
export function readLocalSyncData(): SyncData {
  return {
    jobs: getAllJobs(),
    copydeck: getSnippets(),
    triage: getTileTriage(),
    legacyUserTiles: [],
    targets: getAllTargets(),
    filters: getAllFilters(),
    evidence: readEvidence(),
    modes: getAllModes(),
    kit: getApplyKit(),
    sweeps: getAllSweeps(),
    mustInclude: getAllMustInclude(),
    trash: getTrash(),
    dreams: getAllDreams(),
    documents: getAllDocuments(),
    profiles: getProfiles(),
    sources: getSources(),
    decided: getDecided(),
    sourceV: BLOB_VERSION,
  };
}

/** The local blob as the JSON a push sends: equal strings mean nothing changed since. */
export function localSyncJson(): string {
  return JSON.stringify(writeBlob(readLocalSyncData()));
}

/** Replace every synced store on this device with `next` (a pull or a merge). */
export function applyLocalSyncData(next: SyncData): void {
  replaceAll(next.jobs);
  replaceSnippets(next.copydeck);
  replaceTriage(next.triage);
  replaceTargets(next.targets);
  replaceFilters(next.filters);
  replaceEvidence(next.evidence);
  replaceModes(next.modes);
  replaceApplyKit(next.kit);
  replaceSweeps(next.sweeps);
  replaceMustInclude(next.mustInclude);
  replaceTrash(next.trash);
  replaceDreams(next.dreams);
  replaceDocuments(next.documents);
  replaceProfiles(next.profiles);
  replaceSources(next.sources);
  replaceDecided(next.decided);
}
