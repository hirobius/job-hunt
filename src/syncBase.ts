// The sync base (#219): the keys of every entry this device last knew to be in the cloud, so
// the sign-in merge can tell a delete from an add. Every page load with a session runs the seed
// merge (a union of this device and the cloud), and a union alone brings back whatever another
// device deleted (or this one deleted before its push landed). With a base it is a three-way
// merge: an entry the base knew that is now missing on one side was deleted there, so it goes.
// New entries on either side are kept, and with no base (first sign-in here) it is the union.
//
// Device-local, per account, never synced (`rjb_sync_base`; sign-out wipes it with the rest).
import { dedupKey } from './store';
import { carries, type VersionedField } from './blobFields';
import type { SyncData } from './syncBlob';

/** The keys of each keyed collection in the blob. */
export type SyncKeys = Record<string, string[]>;

const BASE_KEY = 'rjb_sync_base';
const lower = (s: string) => s.trim().toLowerCase();
const perTrack = <T>(m: Record<string, T[]>, key: (x: T) => string) =>
  Object.entries(m).flatMap(([track, list]) => list.map((x) => `${track}\u0000${key(x)}`));

/** Each collection's key rule: the identity its own merge uses. */
const KEYS: Record<string, (d: SyncData) => string[]> = {
  jobs: (d) => d.jobs.map((j) => dedupKey(j.url)),
  trash: (d) => d.trash.map((r) => dedupKey(r.job.url)),
  copydeck: (d) => d.copydeck.map((s) => s.id),
  dismissed: (d) => d.triage.dismissed,
  answers: (d) => d.kit.answers.map((a) => a.id),
  targets: (d) => perTrack(d.targets, (t) => lower(t.login)),
  filters: (d) => perTrack(d.filters, (f) => lower(f.name)),
  dreams: (d) => perTrack(d.dreams, (x) => x.key),
  documents: (d) => d.documents.map((x) => x.id),
};

/** The blob field each collection lives in (for the version that first carried it). */
const FIELD: Record<string, VersionedField> = {
  jobs: 'jobs',
  trash: 'trash',
  copydeck: 'copydeck',
  dismissed: 'triage',
  answers: 'kit',
  targets: 'targets',
  filters: 'filters',
  dreams: 'dreams',
  documents: 'documents',
};

export function keysOf(d: SyncData): SyncKeys {
  const out: SyncKeys = {};
  for (const [name, keys] of Object.entries(KEYS)) out[name] = keys(d);
  return out;
}

/** Drop from the merged blob each entry the base knew that is now missing in the cloud or here.
 *  A cloud copy older than a field says nothing about it, so only this device's deletes count. */
export function withoutDeleted(
  merged: SyncData,
  cloud: SyncData,
  local: SyncData,
  base: SyncKeys,
): SyncData {
  const gone: Record<string, Set<string>> = {};
  for (const [name, keys] of Object.entries(KEYS)) {
    const known = new Set(base[name] ?? []);
    const inCloud = carries(cloud.sourceV, FIELD[name]) ? new Set(keys(cloud)) : null;
    const inLocal = new Set(keys(local));
    gone[name] = new Set([...known].filter((k) => !inLocal.has(k) || (inCloud && !inCloud.has(k))));
  }
  const keep =
    <T>(name: string, key: (x: T) => string) =>
    (x: T) =>
      !gone[name].has(key(x));
  const keepTrack = <T>(name: string, m: Record<string, T[]>, key: (x: T) => string) => {
    const out: Record<string, T[]> = {};
    for (const [track, list] of Object.entries(m)) {
      const kept = list.filter((x) => !gone[name].has(`${track}\u0000${key(x)}`));
      if (kept.length) out[track] = kept;
    }
    return out;
  };
  return {
    ...merged,
    jobs: merged.jobs.filter(keep('jobs', (j) => dedupKey(j.url))),
    trash: merged.trash.filter(keep('trash', (r) => dedupKey(r.job.url))),
    copydeck: merged.copydeck.filter(keep('copydeck', (s) => s.id)),
    triage: { dismissed: merged.triage.dismissed.filter(keep('dismissed', (u: string) => u)) },
    kit: { ...merged.kit, answers: merged.kit.answers.filter(keep('answers', (a) => a.id)) },
    targets: keepTrack('targets', merged.targets, (t) => lower(t.login)),
    filters: keepTrack('filters', merged.filters, (f) => lower(f.name)),
    dreams: keepTrack('dreams', merged.dreams, (x) => x.key),
    documents: merged.documents.filter(keep('documents', (x) => x.id)),
  };
}

/** This account's base on this device, or null (none yet, another account's, or unreadable). */
export function readSyncBase(uid: string): SyncKeys | null {
  try {
    const raw = localStorage.getItem(BASE_KEY);
    const o = raw ? (JSON.parse(raw) as { uid?: unknown; keys?: unknown }) : null;
    if (!o || o.uid !== uid || !o.keys || typeof o.keys !== 'object') return null;
    const keys: SyncKeys = {};
    for (const [name, list] of Object.entries(o.keys as Record<string, unknown>))
      if (Array.isArray(list)) keys[name] = list.filter((k): k is string => typeof k === 'string');
    return keys;
  } catch {
    return null;
  }
}

export function writeSyncBase(uid: string, keys: SyncKeys) {
  try {
    localStorage.setItem(BASE_KEY, JSON.stringify({ uid, keys }));
  } catch {
    /* blocked storage: the next sign-in merge is a plain union, as before */
  }
}
