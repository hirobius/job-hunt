// The sync base (#219): the keys of every entry this device last knew to be in the cloud, so
// the sign-in merge can tell a delete from an add. Every page load with a session runs the seed
// merge (a union of this device and the cloud), and a union alone brings back whatever another
// device deleted (or this one deleted before its push landed). With a base it is a three-way
// merge: an entry the base knew that is now missing on one side was deleted there, so it goes.
// New entries on either side are kept, and with no base (first sign-in here) it is the union.
//
// It also keeps a short hash of each entry as the cloud held it (data-safety audit, 2026-10-23),
// so the merge can tell which side changed an entry both have: an edit made here and not yet
// pushed (a reload inside the debounce, offline, an edit during a pull) wins over a cloud copy
// that did not change it, and the cloud's change wins over an entry this device left alone.
// Where both changed it, each store's own merge rule decides (cloud first), as before.
//
// Device-local, per account, never synced (`rjb_sync_base`; sign-out wipes it with the rest).
import { dedupKey } from './store';
import { carries, type VersionedField } from './blobFields';
import type { SyncData } from './syncBlob';
import type { KitFieldKey } from './applyKit';

/** The keys of each keyed collection in the blob. */
export type SyncKeys = Record<string, string[]>;
/** Per collection, each entry's hash as the cloud held it. */
export type SyncHashes = Record<string, Record<string, string>>;

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

// ── Entry hashes ─────────────────────────────────────────────────────────────────────────────
type Entries = Map<string, unknown>;
interface Collection {
  field: VersionedField;
  /** A map's entries can be added and removed by this pass; a list's are only replaced (adds and
   *  deletes are the union's and withoutDeleted's). */
  map?: boolean;
  get(d: SyncData): Entries;
  put(d: SyncData, e: Entries): SyncData;
}

const listOf = <T>(list: T[], key: (x: T) => string): Entries =>
  new Map(list.map((x) => [key(x), x]));
const swap = <T>(list: T[], key: (x: T) => string, e: Entries) =>
  list.map((x) => (e.has(key(x)) ? (e.get(key(x)) as T) : x));
const tracksOf = <T>(m: Record<string, T[]>, key: (x: T) => string): Entries =>
  new Map(Object.entries(m).flatMap(([t, list]) => list.map((x) => [`${t}\u0000${key(x)}`, x])));
const swapTracks = <T>(m: Record<string, T[]>, key: (x: T) => string, e: Entries) =>
  Object.fromEntries(
    Object.entries(m).map(([t, list]) => [t, swap(list, (x) => `${t}\u0000${key(x)}`, e)]),
  );
const present = (v: unknown) => v !== undefined && v !== '';
const recordOf = (m: Record<string, unknown>): Entries =>
  new Map(Object.entries(m).filter(([, v]) => present(v)));

const COLLECTIONS: Record<string, Collection> = {
  jobs: {
    field: 'jobs',
    get: (d) => listOf(d.jobs, (j) => dedupKey(j.url)),
    put: (d, e) => ({ ...d, jobs: swap(d.jobs, (j) => dedupKey(j.url), e) }),
  },
  trash: {
    field: 'trash',
    get: (d) => listOf(d.trash, (r) => dedupKey(r.job.url)),
    put: (d, e) => ({ ...d, trash: swap(d.trash, (r) => dedupKey(r.job.url), e) }),
  },
  copydeck: {
    field: 'copydeck',
    get: (d) => listOf(d.copydeck, (s) => s.id),
    put: (d, e) => ({ ...d, copydeck: swap(d.copydeck, (s) => s.id, e) }),
  },
  answers: {
    field: 'kit',
    get: (d) => listOf(d.kit.answers, (a) => a.id),
    put: (d, e) => ({ ...d, kit: { ...d.kit, answers: swap(d.kit.answers, (a) => a.id, e) } }),
  },
  // The kit's profile fields and its two letter picks ('@why', '@cover'); empty = not set.
  kitFields: {
    field: 'kit',
    map: true,
    get: (d) =>
      recordOf({ ...d.kit.fields, '@why': d.kit.whyTemplate, '@cover': d.kit.coverTemplate }),
    put: (d, e) => {
      const fields: Partial<Record<KitFieldKey, string>> = {};
      for (const [k, v] of e) if (!k.startsWith('@')) fields[k as KitFieldKey] = v as string;
      const kit = { ...d.kit, fields };
      kit.whyTemplate = (e.get('@why') as string | undefined) || undefined;
      kit.coverTemplate = (e.get('@cover') as string | undefined) || undefined;
      return { ...d, kit };
    },
  },
  targets: {
    field: 'targets',
    get: (d) => tracksOf(d.targets, (t) => lower(t.login)),
    put: (d, e) => ({ ...d, targets: swapTracks(d.targets, (t) => lower(t.login), e) }),
  },
  filters: {
    field: 'filters',
    get: (d) => tracksOf(d.filters, (f) => lower(f.name)),
    put: (d, e) => ({ ...d, filters: swapTracks(d.filters, (f) => lower(f.name), e) }),
  },
  dreams: {
    field: 'dreams',
    get: (d) => tracksOf(d.dreams, (x) => x.key),
    put: (d, e) => ({ ...d, dreams: swapTracks(d.dreams, (x) => x.key, e) }),
  },
  documents: {
    field: 'documents',
    get: (d) => listOf(d.documents, (x) => x.id),
    put: (d, e) => ({ ...d, documents: swap(d.documents, (x) => x.id, e) }),
  },
  modes: {
    field: 'modes',
    map: true,
    get: (d) => recordOf(d.modes),
    put: (d, e) => ({ ...d, modes: Object.fromEntries(e) as SyncData['modes'] }),
  },
  sweeps: {
    field: 'sweeps',
    map: true,
    get: (d) => recordOf(d.sweeps),
    put: (d, e) => ({ ...d, sweeps: Object.fromEntries(e) as SyncData['sweeps'] }),
  },
  mustInclude: {
    field: 'mustInclude',
    map: true,
    get: (d) => recordOf(d.mustInclude),
    put: (d, e) => ({ ...d, mustInclude: Object.fromEntries(e) as SyncData['mustInclude'] }),
  },
  evidence: {
    field: 'evidence',
    map: true,
    get: (d) => recordOf({ text: d.evidence }),
    put: (d, e) => ({ ...d, evidence: (e.get('text') as string | undefined) ?? '' }),
  },
};

/** JSON with object keys sorted, so the same entry always hashes the same. */
function canonical(v: unknown): string {
  if (Array.isArray(v))
    return `[${v.map((x) => (x === undefined ? 'null' : canonical(x))).join(',')}]`;
  if (v && typeof v === 'object')
    return `{${Object.keys(v)
      .sort()
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  return JSON.stringify(v) ?? 'null';
}

/** A short hash (cyrb53) of an entry; '' for an absent one. */
export function hashEntry(v: unknown): string {
  if (!present(v)) return '';
  const s = canonical(v);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export function hashesOf(d: SyncData): SyncHashes {
  const out: SyncHashes = {};
  for (const [name, c] of Object.entries(COLLECTIONS)) {
    out[name] = {};
    for (const [k, v] of c.get(d)) out[name][k] = hashEntry(v);
  }
  return out;
}

/** For each entry both sides could have changed since the last sync, keep the side that did:
 *  this device's edit over an unchanged cloud copy, the cloud's over an entry left alone here.
 *  Changed on both: the merge's own result stands. A cloud copy older than a field says nothing
 *  about it (the merge kept this device's). */
export function withEdits(
  merged: SyncData,
  cloud: SyncData,
  local: SyncData,
  base: SyncHashes,
): SyncData {
  let out = merged;
  for (const [name, c] of Object.entries(COLLECTIONS)) {
    const known = base[name];
    if (!known || !carries(cloud.sourceV, c.field)) continue;
    const here = c.get(local);
    const there = c.get(cloud);
    const next = c.get(out);
    const keys = c.map
      ? new Set([...here.keys(), ...there.keys(), ...Object.keys(known)])
      : next.keys();
    let changed = false;
    for (const k of [...keys]) {
      const was = known[k] ?? (c.map ? '' : undefined);
      if (was === undefined) continue; // new since the last sync: the union has it
      const mine = hashEntry(here.get(k));
      const theirs = hashEntry(there.get(k));
      const pick =
        mine !== was && theirs === was ? here : mine === was && theirs !== was ? there : null;
      if (!pick) continue;
      const v = pick.get(k);
      if (present(v)) next.set(k, v);
      else if (c.map) next.delete(k);
      else continue; // a list entry gone on one side is withoutDeleted's to drop
      changed = true;
    }
    if (changed) out = c.put(out, next);
  }
  return out;
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

/** The entry hashes kept with this account's base, or null (none, or a base from before them). */
export function readSyncHashes(uid: string): SyncHashes | null {
  try {
    const raw = localStorage.getItem(BASE_KEY);
    const o = raw ? (JSON.parse(raw) as { uid?: unknown; hashes?: unknown }) : null;
    if (!o || o.uid !== uid || !o.hashes || typeof o.hashes !== 'object') return null;
    const out: SyncHashes = {};
    for (const [name, m] of Object.entries(o.hashes as Record<string, unknown>)) {
      if (!m || typeof m !== 'object') continue;
      out[name] = {};
      for (const [k, v] of Object.entries(m as Record<string, unknown>))
        if (typeof v === 'string') out[name][k] = v;
    }
    return out;
  } catch {
    return null;
  }
}

export function writeSyncBase(uid: string, keys: SyncKeys, hashes?: SyncHashes) {
  try {
    localStorage.setItem(BASE_KEY, JSON.stringify(hashes ? { uid, keys, hashes } : { uid, keys }));
  } catch {
    /* blocked storage: the next sign-in merge is a plain union, as before */
  }
}
