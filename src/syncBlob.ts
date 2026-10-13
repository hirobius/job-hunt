// The cloud sync blob — its shape, parsing, and merge, as one pure module. CloudSync.tsx is
// left owning only auth + transport; all the "what's in the blob and how do conflicts resolve"
// reasoning lives here and is unit-testable without Supabase. Each field's merge rule lives
// with its store (mergeJobs, mergeTriage's set-aside-wins, …); this module only composes them.
//
// v4 (#99) carries only what still has a home: jobs, snippets, and set-aside tiles. Curated
// tracks sync through their own tables (src/curation/sync.ts). Older blobs still read:
//   v1  a bare Job[]
//   v3  { jobs, pillars, copydeck, triage: { pinned, dismissed }, userTiles }
//       → pillars are ignored (retired), cloud pins are ignored (pins are device-local now),
//         userTiles surface as `legacyUserTiles` for the one-time "My links" fold.
import { mergeJobs } from './store';
import { mergeSnippets, type Snippet } from './copyDeckStore';
import { mergeTriage, type Triage } from './tileTriage';
import type { LegacyTile } from './curation/legacyTiles';
import type { Job } from './types';

export type { Triage };

export interface SyncData {
  jobs: Job[];
  copydeck: Snippet[];
  /** `pinned` is device-local (never written); `dismissed` (set aside) syncs. */
  triage: Triage;
  /** v3-only user tiles awaiting the one-time fold into curation. Never written. */
  legacyUserTiles: LegacyTile[];
}

/** Blob schema version written to the cloud. */
export const BLOB_VERSION = 4;

export function emptyBlob(): SyncData {
  return { jobs: [], copydeck: [], triage: { pinned: [], dismissed: [] }, legacyUserTiles: [] };
}

const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const isLegacyTile = (t: unknown): t is LegacyTile =>
  !!t && typeof (t as LegacyTile).url === 'string' && !!(t as LegacyTile).url;

/** Parse a stored blob of any version. Missing / non-array fields default to empty. */
export function readBlob(data: unknown): SyncData {
  if (Array.isArray(data)) return { ...emptyBlob(), jobs: data as Job[] };
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
  };
}

/** The v4 object written to the cloud. */
export function writeBlob(d: SyncData) {
  return {
    v: BLOB_VERSION,
    jobs: d.jobs,
    copydeck: d.copydeck,
    triage: { dismissed: d.triage.dismissed },
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
    return {
      ...cloud,
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
  };
}
