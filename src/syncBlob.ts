// The cloud sync blob — its shape, parsing, and merge, as one pure module. CloudSync.tsx is
// left owning only auth + transport; all the "what's in the blob and how do conflicts resolve"
// reasoning lives here and is unit-testable without Supabase. Each field's merge rule lives
// with its store (mergeJobs, mergeTriage's set-aside-wins, …); this module only composes them.
//
// v6 (ADR 0009) adds Recently removed: jobs removed in the last 30 days (`src/trash.ts`).
// v5 (ADR 0008) adds the user-edited stores that used to live only in this browser: outreach
// targets, saved searches, the evidence text and the work mode per track. All optional on read.
// v4 (#99) carried jobs, snippets, and set-aside tiles. Curated
// tracks sync through their own tables (src/curation/sync.ts). Older blobs still read:
//   v1  a bare Job[]
//   v3  { jobs, pillars, copydeck, triage: { pinned, dismissed }, userTiles }
//       → pillars are ignored (retired), cloud pins are ignored (pins are device-local now),
//         userTiles surface as `legacyUserTiles` for the one-time "My links" fold.
import { mergeJobs } from './store';
import { mergeSnippets, type Snippet } from './copyDeckStore';
import { mergeTriage, type Triage } from './tileTriage';
import type { LegacyTile } from './curation/legacyTiles';
import { mergeTargets, sanitizeTargets, type Target } from './feed/targets';
import { mergeFilters, sanitizeFilters, type SavedFilter } from './feed/savedFilters';
import { capEvidence, mergeEvidence } from './radar/evidenceStore';
import { mergeModes, sanitizeModes } from './trackModes';
import type { WorkMode } from './jobsData';
import type { Job } from './types';
import { isSample, withoutSample } from './demo/isSample';
import { mergeTrash, sanitizeTrash, type Removed } from './trash';

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
  /** Jobs removed in the last 30 days, newest first (v6). */
  trash: Removed[];
  /** The blob version this was read from (0 = not read from a blob). A pre-v5 cloud copy says
   *  nothing about the v5 fields, so a refresh must not let its emptiness wipe local values. */
  sourceV: number;
}

/** Blob schema version written to the cloud. */
export const BLOB_VERSION = 6;

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
    trash: [],
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
    trash: sanitizeTrash(o.trash),
    sourceV: typeof o.v === 'number' ? o.v : 0,
  };
}

/** The v6 object written to the cloud. */
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
    trash: d.trash.filter((r) => !isSample(r.job)),
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
    // An older cloud copy has no opinion on the fields added since: keep this device's.
    const v5 =
      cloud.sourceV >= 5
        ? {}
        : {
            targets: local.targets,
            filters: local.filters,
            evidence: local.evidence,
            modes: local.modes,
          };
    const v6 = cloud.sourceV >= 6 ? {} : { trash: local.trash };
    return {
      ...cloud,
      ...v5,
      ...v6,
      jobs: [...cloud.jobs, ...local.jobs.filter(isSample)], // keep this device's sample
      triage: {
        pinned: local.triage.pinned.filter((u) => !dismissed.has(u)),
        dismissed: cloud.triage.dismissed,
      },
    };
  }
  return {
    jobs: mergeJobs(cloud.jobs, local.jobs),
    copydeck: mergeSnippets(cloud.copydeck, local.copydeck),
    triage: mergeTriage(cloud.triage, local.triage),
    legacyUserTiles: cloud.legacyUserTiles,
    targets: mergeTargets(cloud.targets, local.targets),
    filters: mergeFilters(cloud.filters, local.filters),
    evidence: mergeEvidence(cloud.evidence, local.evidence),
    modes: mergeModes(cloud.modes, local.modes),
    trash: mergeTrash(cloud.trash, local.trash),
    sourceV: cloud.sourceV,
  };
}
