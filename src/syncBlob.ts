// The cloud sync blob — its shape, parsing, and merge, as one pure module. CloudSync.tsx is
// left owning only auth + transport; all the "what's in the blob and how do conflicts resolve"
// reasoning lives here and is unit-testable without Supabase. Each field's merge rule lives
// with its store (mergeJobs, mergeTriage's set-aside-wins, …); this module only composes them.
import { mergeJobs } from './store';
import { mergePillars } from './pillarStore';
import { mergeSnippets, type Snippet } from './copyDeckStore';
import { mergeTriage, type Triage } from './tileTriage';
import { mergeUserTiles } from './userTiles';
import type { Job } from './types';
import type { Pillar } from './pillars';
import type { Tile } from './jobsData';

export type { Triage };

export interface SyncData {
  jobs: Job[];
  pillars: Pillar[];
  copydeck: Snippet[];
  triage: Triage;
  userTiles: Tile[];
}

/** Blob schema version written to the cloud. */
export const BLOB_VERSION = 3;

export function emptyBlob(): SyncData {
  return { jobs: [], pillars: [], copydeck: [], triage: { pinned: [], dismissed: [] }, userTiles: [] };
}

/** Parse a stored blob. Historically a bare Job[]; now { v, jobs, pillars, copydeck, triage,
 *  userTiles }. Missing/!array fields default to empty, so old blobs still load. */
export function readBlob(data: unknown): SyncData {
  if (Array.isArray(data)) return { ...emptyBlob(), jobs: data as Job[] };
  const o = (data ?? {}) as {
    jobs?: unknown;
    pillars?: unknown;
    copydeck?: unknown;
    triage?: unknown;
    userTiles?: unknown;
  };
  const tr = (o.triage ?? {}) as { pinned?: unknown; dismissed?: unknown };
  return {
    jobs: Array.isArray(o.jobs) ? (o.jobs as Job[]) : [],
    pillars: Array.isArray(o.pillars) ? (o.pillars as Pillar[]) : [],
    copydeck: Array.isArray(o.copydeck) ? (o.copydeck as Snippet[]) : [],
    triage: {
      pinned: Array.isArray(tr.pinned) ? (tr.pinned as string[]) : [],
      dismissed: Array.isArray(tr.dismissed) ? (tr.dismissed as string[]) : [],
    },
    userTiles: Array.isArray(o.userTiles) ? (o.userTiles as Tile[]) : [],
  };
}

/** Resolve cloud vs local into the blob to adopt.
 *  - seed (first sign-in): merge each field, so nothing on this device is lost.
 *  - refresh (focus re-pull): cloud is the source of truth if present, else keep local. */
export function mergeBlob(cloud: SyncData | null, local: SyncData, seed: boolean): SyncData {
  if (!seed) return cloud ?? local;
  return {
    jobs: mergeJobs(cloud?.jobs ?? null, local.jobs),
    pillars: mergePillars(cloud?.pillars ?? null, local.pillars),
    copydeck: mergeSnippets(cloud?.copydeck ?? null, local.copydeck),
    triage: mergeTriage(cloud?.triage ?? null, local.triage),
    userTiles: mergeUserTiles(cloud?.userTiles ?? null, local.userTiles),
  };
}
