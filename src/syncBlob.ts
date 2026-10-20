// The cloud sync blob — its shape, parsing, and merge, as one pure module. CloudSync.tsx is
// left owning only auth + transport; all the "what's in the blob and how do conflicts resolve"
// reasoning lives here and is unit-testable without Supabase. Each field's merge rule lives
// with its store (mergeJobs, mergeTriage's set-aside-wins, …); this module only composes them.
//
// v8 (ADR 0008 addendum) adds Recently removed: jobs removed in the last 30 days (`src/trash.ts`).
// v9 adds dream companies per track (src/feed/dreams.ts), same pattern as the v5 stores.
// v10 adds Documents with their Versions (src/documents.ts, #226), same pattern.
// v7 adds the wide sweep's titles per track (#213), optional on read.
// v6 adds the Application kit (rapid apply: profile fields + saved answers), optional on read.
// v5 (ADR 0008) adds the user-edited stores that used to live only in this browser: outreach
// targets, saved searches, the evidence text and the work mode per track. All optional on read.
// v4 (#99) carried jobs, snippets, and set-aside tiles. Curated
// tracks sync through their own tables (src/curation/sync.ts). Older blobs still read:
//   v1  a bare Job[]
//   v3  { jobs, pillars, copydeck, triage: { pinned, dismissed }, userTiles }
//       → pillars are ignored (retired), cloud pins are ignored (pins are retired, #19),
//         userTiles surface as `legacyUserTiles` for the one-time "My links" fold.
import { dedupKey, mergeJobs } from './store';
import { mergeSnippets, type Snippet } from './copyDeckStore';
import { mergeTriage, type Triage } from './tileTriage';
import type { LegacyTile } from './curation/legacyTiles';
import { mergeTargets, sanitizeTargets, type Target } from './feed/targets';
import { mergeFilters, sanitizeFilters, type SavedFilter } from './feed/savedFilters';
import { capEvidence, mergeEvidence } from './radar/evidenceStore';
import { mergeModes, sanitizeModes } from './trackModes';
import { emptyKit, mergeKit, sanitizeKit, type ApplyKit } from './applyKit';
import { mergeSweeps, sanitizeSweeps, type SweepTitles } from './feed/sweepTitles';
import { mergeDreams, sanitizeDreams, type Dream } from './feed/dreams';
import type { WorkMode } from './jobsData';
import type { Job } from './types';
import { isSample, withoutSample } from './demo/isSample';
import { mergeTrash, sanitizeTrash, type Removed } from './trash';
import { withoutDeleted, type SyncKeys } from './syncBase';
import { carries, FIELD_SINCE, type VersionedField } from './blobFields';
import {
  mergeDocuments,
  sanitizeDocuments,
  withoutSampleDocuments,
  type Document,
} from './documents';

export type { Triage };

/** The fields added from v5 on: an older cloud copy says nothing about them (FIELD_SINCE). */
const OPTIONAL_FIELDS = (Object.keys(FIELD_SINCE) as VersionedField[]).filter(
  (f) => FIELD_SINCE[f] >= 5,
);

export interface SyncData {
  jobs: Job[];
  copydeck: Snippet[];
  /** Set-aside tiles. */
  triage: Triage;
  /** v3-only user tiles awaiting the one-time fold into curation. Never written. */
  legacyUserTiles: LegacyTile[];
  /** Outreach targets per track (v5). */
  targets: Record<string, Target[]>;
  /** Saved Live-postings searches per track (v5). */
  filters: Record<string, SavedFilter[]>;
  /** The user's evidence text (v5). */
  evidence: string;
  /** Work mode per track (v5). */
  modes: Record<string, WorkMode>;
  /** The Application kit (v6). */
  kit: ApplyKit;
  /** The wide sweep's titles and on/off per track (v7). */
  sweeps: Record<string, SweepTitles>;
  /** Jobs removed in the last 30 days, newest first (v8). */
  trash: Removed[];
  /** Dream companies per track (v9). */
  dreams: Record<string, Dream[]>;
  /** Documents and their Versions (v10). */
  documents: Document[];
  /** The blob version this was read from (0 = not read from a blob). A pre-v5 cloud copy says
   *  nothing about the v5 fields, so a refresh must not let its emptiness wipe local values. */
  sourceV: number;
}

/** Blob schema version written to the cloud. */
export const BLOB_VERSION = 10;

export function emptyBlob(): SyncData {
  return {
    jobs: [],
    copydeck: [],
    triage: { dismissed: [] },
    legacyUserTiles: [],
    targets: {},
    filters: {},
    evidence: '',
    modes: {},
    kit: emptyKit(),
    sweeps: {},
    trash: [],
    dreams: {},
    documents: [],
    sourceV: 0,
  };
}

const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const isLegacyTile = (t: unknown): t is LegacyTile =>
  !!t && typeof (t as LegacyTile).url === 'string' && !!(t as LegacyTile).url;

/** Parse a stored blob of any version. Missing / non-array fields default to empty. */
export function readBlob(data: unknown): SyncData {
  if (Array.isArray(data)) return { ...emptyBlob(), jobs: data as Job[], sourceV: 1 };
  const o = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const tr = (o.triage && typeof o.triage === 'object' ? o.triage : {}) as { dismissed?: unknown };
  return {
    jobs: arr(o.jobs) as Job[],
    copydeck: arr(o.copydeck) as Snippet[],
    triage: { dismissed: arr(tr.dismissed).filter((u) => typeof u === 'string') as string[] },
    legacyUserTiles: arr(o.userTiles)
      .filter(isLegacyTile)
      .map((t) => ({ name: t.name || '', meta: t.meta || '', url: t.url })),
    targets: sanitizeTargets(o.targets),
    filters: sanitizeFilters(o.filters),
    evidence: typeof o.evidence === 'string' ? capEvidence(o.evidence) : '',
    modes: sanitizeModes(o.modes),
    kit: sanitizeKit(o.kit),
    sweeps: sanitizeSweeps(o.sweeps),
    trash: sanitizeTrash(o.trash),
    dreams: sanitizeDreams(o.dreams),
    documents: sanitizeDocuments(o.documents),
    sourceV: typeof o.v === 'number' ? o.v : 0,
  };
}

/** The object written to the cloud. */
export function writeBlob(d: SyncData) {
  return {
    v: BLOB_VERSION,
    jobs: withoutSample(d.jobs), // sample data (#107) is device-local; never pushed
    copydeck: d.copydeck,
    triage: { dismissed: d.triage.dismissed },
    targets: d.targets,
    filters: d.filters,
    evidence: d.evidence,
    modes: d.modes,
    kit: d.kit,
    sweeps: d.sweeps,
    trash: d.trash.filter((r) => !isSample(r.job)),
    dreams: d.dreams,
    documents: withoutSampleDocuments(d.documents, d.jobs),
  };
}

/** Resolve cloud vs local into the blob to adopt.
 *  - seed (sign-in, incl. every page load with a session): merge each field, so nothing on this
 *    device is lost. With this device's sync `base` (#219) an entry deleted on either side since
 *    the last sync stays deleted; without one it is the plain union.
 *  - refresh (focus re-pull): cloud is the source of truth if present, else keep local. */
export function mergeBlob(
  cloud: SyncData | null,
  local: SyncData,
  seed: boolean,
  base: SyncKeys | null = null,
): SyncData {
  if (!cloud) return seed ? { ...local, legacyUserTiles: [] } : local;
  if (!seed) {
    // A cloud copy older than a field has no opinion on it: keep this device's (FIELD_SINCE).
    // (jobs, snippets and set-aside predate every cloud copy still around: cloud wins on those.)
    const keep = OPTIONAL_FIELDS.filter((f) => !carries(cloud.sourceV, f));
    const older = Object.fromEntries(keep.map((f) => [f, local[f]])) as Partial<SyncData>;
    return {
      ...cloud,
      ...older,
      jobs: [...cloud.jobs, ...local.jobs.filter(isSample)], // keep this device's sample
      triage: { dismissed: cloud.triage.dismissed },
    };
  }
  const union: SyncData = {
    jobs: mergeJobs(cloud.jobs, local.jobs),
    copydeck: mergeSnippets(cloud.copydeck, local.copydeck),
    triage: mergeTriage(cloud.triage, local.triage),
    legacyUserTiles: cloud.legacyUserTiles,
    targets: mergeTargets(cloud.targets, local.targets),
    filters: mergeFilters(cloud.filters, local.filters),
    evidence: mergeEvidence(cloud.evidence, local.evidence),
    modes: mergeModes(cloud.modes, local.modes),
    kit: mergeKit(cloud.kit, local.kit),
    sweeps: mergeSweeps(cloud.sweeps, local.sweeps),
    trash: mergeTrash(cloud.trash, local.trash),
    dreams: mergeDreams(cloud.dreams, local.dreams),
    documents: mergeDocuments(cloud.documents, local.documents),
    sourceV: cloud.sourceV,
  };
  const merged = base ? withoutDeleted(union, cloud, local, base) : union;
  // A job saved on either side is not also listed as removed.
  const saved = new Set(merged.jobs.map((j) => dedupKey(j.url)));
  return { ...merged, trash: merged.trash.filter((r) => !saved.has(dedupKey(r.job.url))) };
}
