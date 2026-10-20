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
//       → pillars are ignored (retired), cloud pins are ignored (pins are device-local now),
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
import {
  mergeDocuments,
  sanitizeDocuments,
  withoutSampleDocuments,
  type Document,
} from './documents';

export type { Triage };

export interface SyncData {
  jobs: Job[];
  copydeck: Snippet[];
  /** `pinned` is device-local (never written); `dismissed` (set aside) syncs. */
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
    triage: { pinned: [], dismissed: [] },
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
    triage: {
      pinned: [],
      dismissed: arr(tr.dismissed).filter((u) => typeof u === 'string') as string[],
    },
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
 *  - seed (first sign-in): merge each field, so nothing on this device is lost.
 *  - refresh (focus re-pull): cloud is the source of truth if present, else keep local.
 *  Either way, this device's pins are kept (minus anything set aside). */
export function mergeBlob(cloud: SyncData | null, local: SyncData, seed: boolean): SyncData {
  if (!cloud) return seed ? { ...local, legacyUserTiles: [] } : local;
  if (!seed) {
    const dismissed = new Set(cloud.triage.dismissed);
    // A cloud copy older than a field has no opinion on it: keep this device's.
    const v5 =
      cloud.sourceV >= 5
        ? {}
        : {
            targets: local.targets,
            filters: local.filters,
            evidence: local.evidence,
            modes: local.modes,
          };
    // Likewise a pre-v6 copy says nothing about the kit.
    const v6 = cloud.sourceV >= 6 ? {} : { kit: local.kit };
    const v7 = cloud.sourceV >= 7 ? {} : { sweeps: local.sweeps };
    // And a pre-v8 copy says nothing about Recently removed.
    const v8 = cloud.sourceV >= 8 ? {} : { trash: local.trash };
    // And a pre-v9 copy says nothing about dream companies.
    const v9 = cloud.sourceV >= 9 ? {} : { dreams: local.dreams };
    // And a pre-v10 copy says nothing about Documents.
    const v10 = cloud.sourceV >= 10 ? {} : { documents: local.documents };
    return {
      ...cloud,
      ...v5,
      ...v6,
      ...v7,
      ...v8,
      ...v9,
      ...v10,
      jobs: [...cloud.jobs, ...local.jobs.filter(isSample)], // keep this device's sample
      triage: {
        pinned: local.triage.pinned.filter((u) => !dismissed.has(u)),
        dismissed: cloud.triage.dismissed,
      },
    };
  }
  const jobs = mergeJobs(cloud.jobs, local.jobs);
  const saved = new Set(jobs.map((j) => dedupKey(j.url)));
  return {
    jobs,
    copydeck: mergeSnippets(cloud.copydeck, local.copydeck),
    triage: mergeTriage(cloud.triage, local.triage),
    legacyUserTiles: cloud.legacyUserTiles,
    targets: mergeTargets(cloud.targets, local.targets),
    filters: mergeFilters(cloud.filters, local.filters),
    evidence: mergeEvidence(cloud.evidence, local.evidence),
    modes: mergeModes(cloud.modes, local.modes),
    kit: mergeKit(cloud.kit, local.kit),
    sweeps: mergeSweeps(cloud.sweeps, local.sweeps),
    // A job saved on either side is not also listed as removed.
    trash: mergeTrash(cloud.trash, local.trash).filter((r) => !saved.has(dedupKey(r.job.url))),
    dreams: mergeDreams(cloud.dreams, local.dreams),
    documents: mergeDocuments(cloud.documents, local.documents),
    sourceV: cloud.sourceV,
  };
}
