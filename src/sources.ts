// Sources (blob v12, simplify spec #384/#385): one synced list of everywhere jobs come from. A
// board on any of the eight ATSs, a followed company (no board yet), a GitHub org, a YC company,
// or a keyless feed. It replaces the per-track watched-board tiles, dream companies and outreach
// targets: the v11 move (v12Migration.ts) unions all of those, across every track, into this list.
// A dream is a Source with `star`; "Not this company" sets `muted` (the Feed leaves it unread).
// A Source is never deleted while the old screens can still add it back: mute it instead.
// Kept in `rjb_sources`, synced in the blob. Storage and the cloud are untrusted.
// The pure half (types, sanitizers, merge) is sourcesModel.ts; this is the store.
import { useMemo } from 'react';
import { liveStorage } from './liveStorage';
import { loadPersisted, savePersisted } from './persisted';
import {
  sanitizeSource,
  sanitizeSources,
  sourceKey,
  withSources,
  type Source,
} from './sourcesModel';

export * from './sourcesModel';

export const SOURCES_KEY = 'rjb_sources';

const readAll = () => sanitizeSources(loadPersisted<unknown>(SOURCES_KEY, []));
const live = liveStorage(SOURCES_KEY);
const write = (all: Source[]) => {
  savePersisted(SOURCES_KEY, all);
  live.notify();
};

/** Every Source (for the sync blob and backup). */
export const getSources = readAll;

/** Replace the whole list (a pull, a restore) and notify subscribers. */
export function replaceSources(all: Source[]): void {
  write(sanitizeSources(all));
}

/** Add Sources the list lacks (see withSources), in one write; nothing is written when nothing
 *  changes (the v12 move tops up on every store change). Returns how many were added. */
export function addSources(add: readonly Source[]): number {
  const clean = sanitizeSources(add);
  const at = new Date().toISOString();
  let added = 0;
  updateSources((cur) => {
    const r = withSources(
      cur,
      clean.map((s) => ({ ...s, addedAt: s.addedAt ?? at })),
    );
    added = r.added;
    return r.list;
  });
  return added;
}

/** Change the whole list in one write; nothing is written when nothing changes. */
export function updateSources(change: (cur: Source[]) => Source[]): void {
  const cur = readAll();
  const next = sanitizeSources(change(cur));
  if (JSON.stringify(next) !== JSON.stringify(cur)) write(next);
}

function patch(key: string, change: (s: Source) => Source) {
  const all = readAll();
  const at = all.findIndex((s) => sourceKey(s) === key);
  if (at < 0) return false;
  const next = sanitizeSource(change(all[at]));
  if (!next) return false;
  all[at] = next;
  write(all);
  return true;
}

/** Star (a dream company) or unstar a Source, by its key. */
export const starSource = (key: string, on: boolean) =>
  patch(key, (s) => {
    const { star: _, ...rest } = s;
    return on ? { ...rest, star: true } : rest;
  });

/** "Not this company" (or undo it), by key. A muted Source stays listed and is never read. */
export const muteSource = (key: string, on: boolean) =>
  patch(key, (s) => {
    const { muted: _, movedMute: __, ...rest } = s;
    return on ? { ...rest, muted: true } : rest;
  });

/** Every Source, live. */
export function useSources(): Source[] {
  const raw = live.useRaw();
  return useMemo(() => {
    try {
      return sanitizeSources(raw ? JSON.parse(raw) : []);
    } catch {
      return [];
    }
  }, [raw]);
}
