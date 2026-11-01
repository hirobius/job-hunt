// Sources (blob v12, simplify spec #384/#385): one synced list of everywhere jobs come from. A
// board on any of the eight ATSs, a followed company (no board yet), a GitHub org, a YC company,
// or a keyless feed. It replaces the per-track watched-board tiles, dream companies and outreach
// targets: the v11 move (v12Migration.ts) unions all of those, across every track, into this list.
// A dream is a Source with `star`; "Not this company" sets `muted` (the Feed leaves it unread).
// A Source is muted, not deleted (the v12 move tops the list up from v11 data); `removeSource` only
// undoes a follow just made.
// Kept in `rjb_sources`, synced in the blob. Storage and the cloud are untrusted.
// The pure half (types, sanitizers, merge) is sourcesModel.ts; this is the store.
import { useMemo } from 'react';
import { liveStorage } from './liveStorage';
import { loadPersisted, savePersisted } from './persisted';
import type { Board } from './feed/sources/ats';
import {
  boardSource,
  nameKey,
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

/** Follow a board, in one write: its Source is added when missing, and a mute on it or on its
 *  company (Not this company, Ignore) is lifted, since following says otherwise. `added` is false
 *  when it was followed already; `undo` puts the list back as it was. */
export function followBoard(b: Board, label: string): { added: boolean; undo: () => void } {
  const s = boardSource(b, label, { addedAt: new Date().toISOString() });
  const key = sourceKey(s);
  const name = nameKey(s.label);
  const lifts = (x: Source) =>
    x.muted && x.kind !== 'feed' && (sourceKey(x) === key || nameKey(x.label) === name);
  let added = false;
  let lifted: string[] = [];
  updateSources((cur) => {
    added = !cur.some((x) => sourceKey(x) === key);
    lifted = cur.filter(lifts).map(sourceKey);
    const next = cur.map((x) => (lifts(x) ? unmuted(x) : x));
    return added ? [...next, s] : next;
  });
  return {
    added,
    undo: () =>
      updateSources((cur) =>
        cur
          .filter((x) => !(added && sourceKey(x) === key))
          .map((x) => (lifted.includes(sourceKey(x)) ? { ...x, muted: true as const } : x)),
      ),
  };
}

const unmuted = (x: Source): Source => {
  const { muted: _, movedMute: __, ...rest } = x;
  return rest;
};

/** A dream company: its Sources (named for it) starred, or a followed company added with a star. */
export function starCompany(name: string): void {
  const k = nameKey(name);
  if (!k) return;
  const named = readAll().filter((s) => s.kind !== 'feed' && nameKey(s.label) === k);
  if (named.length) named.forEach((s) => starSource(sourceKey(s), true));
  else addSources([{ kind: 'company', ref: k, label: name.trim(), star: true }]);
}

/** Take a Source off the list, by key (a follow's Undo). */
export const removeSource = (key: string) =>
  updateSources((cur) => cur.filter((s) => sourceKey(s) !== key));

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
