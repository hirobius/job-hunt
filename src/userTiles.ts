// User-added apprenticeship tiles. Lets you paste any link(s) into the Apprenticeships board
// and treat them like the curated tiles (open / save / pin / set aside). Built on the shared
// createStore factory; persisted to localStorage and cloud-synced via CloudSync.
import { createStore } from './createStore';
import { mergeByKey } from './mergeByKey';
import { loadPersisted, savePersisted } from './persisted';
import { cleanUrl, prettyTitle } from './store';
import type { Tile } from './jobsData';

const KEY = 'rjb_user_tiles';

const store = createStore<Tile[]>(loadPersisted<Tile[]>(KEY, []), {
  onSet: (next) => savePersisted(KEY, next),
});

const URL_RE = /https?:\/\/[^\s<>"')]+/gi;

/** Parse pasted text into tiles — one per URL found, named from the URL, newest first.
 *  Skips URLs already added. Returns how many were added. */
export function addUserTilesFromText(text: string): number {
  const tiles = store.get();
  const found = text.match(URL_RE) || [];
  const have = new Set(tiles.map((t) => t.url));
  const additions: Tile[] = [];
  for (const raw of found) {
    const url = cleanUrl(raw);
    if (!url || have.has(url)) continue;
    have.add(url);
    additions.push({ name: prettyTitle(url), meta: 'Added by you', url });
  }
  if (additions.length) store.set([...additions, ...tiles]);
  return additions.length;
}

export function removeUserTile(url: string) {
  store.set(store.get().filter((t) => t.url !== url));
}

/** Replace the whole list (cloud sync). Drops malformed entries, fills missing names. */
export function replaceUserTiles(list: Tile[]) {
  store.set(
    (list || [])
      .filter((t) => t && t.url)
      .map((t) => ({ name: t.name || prettyTitle(t.url), meta: t.meta || '', url: t.url })),
  );
}

export function getUserTiles(): Tile[] {
  return store.get();
}

/** Merge cloud + local user tiles by URL (local order kept, cloud wins). For the sync layer. */
export const mergeUserTiles = (cloud: Tile[] | null, local: Tile[]): Tile[] =>
  mergeByKey((t) => t.url, cloud, local);

export function useUserTiles(): Tile[] {
  return store.use();
}
