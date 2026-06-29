// User-added apprenticeship tiles. Lets you paste any link(s) into the Apprenticeships board
// and treat them like the curated tiles (open / save / pin / set aside). A small external
// store mirroring src/store.ts; persisted to localStorage and cloud-synced via CloudSync.
import { useSyncExternalStore } from 'react';
import { loadPersisted, savePersisted } from './persisted';
import { cleanUrl, prettyTitle } from './store';
import type { Tile } from './jobsData';

const KEY = 'rjb_user_tiles';

let tiles: Tile[] = loadPersisted<Tile[]>(KEY, []);
const listeners = new Set<() => void>();

function set(next: Tile[]) {
  tiles = next;
  savePersisted(KEY, next);
  listeners.forEach((l) => l());
}

const URL_RE = /https?:\/\/[^\s<>"')]+/gi;

/** Parse pasted text into tiles — one per URL found, named from the URL, newest first.
 *  Skips URLs already added. Returns how many were added. */
export function addUserTilesFromText(text: string): number {
  const found = text.match(URL_RE) || [];
  const have = new Set(tiles.map((t) => t.url));
  const additions: Tile[] = [];
  for (const raw of found) {
    const url = cleanUrl(raw);
    if (!url || have.has(url)) continue;
    have.add(url);
    additions.push({ name: prettyTitle(url), meta: 'Added by you', url });
  }
  if (additions.length) set([...additions, ...tiles]);
  return additions.length;
}

export function removeUserTile(url: string) {
  set(tiles.filter((t) => t.url !== url));
}

/** Replace the whole list (cloud sync). Drops malformed entries, fills missing names. */
export function replaceUserTiles(list: Tile[]) {
  set(
    (list || [])
      .filter((t) => t && t.url)
      .map((t) => ({ name: t.name || prettyTitle(t.url), meta: t.meta || '', url: t.url })),
  );
}

export function getUserTiles(): Tile[] {
  return tiles;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
function getSnapshot() {
  return tiles;
}

export function useUserTiles(): Tile[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
