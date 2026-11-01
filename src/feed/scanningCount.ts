// "Scanning N sources" (#src-bulk): how many sources are scanned for this person, counted honestly.
// Each board once under the sync's key (boardSet.ts `setBoardKey`), each feed once whatever the
// terms. Signed out, that is what this browser's scan reads: the followed boards, the confirmed
// companies it found and the feeds fetchFeed reads. Signed in, the server's rotation also reads the
// whole committed board set (data/boards.json; its keys alone in data/board-keys.json), so its boards join the union. The keys are big
// (thousands of boards), so it is a lazy chunk loaded only for a signed-in person, once per page.
import { useEffect, useState } from 'react';
import { keysFromCompact, setBoardKey } from './boardSet';
import { SOURCE_ENABLED } from './sourceEnabled';
import { parseBoardUrl } from './sources/ats';
import { PROXIED_SOURCES } from './sources/proxiedIds';
import { importFresh } from '../staleBuild';

/** The feeds a search reads, by fetchFeed's source key (scanningCount.test.ts pins it to
 *  fetchFeed's own keys). */
export function feedKeys(enabled: Partial<typeof SOURCE_ENABLED> = SOURCE_ENABLED): string[] {
  const optional = ['jobicy', 'remoteok', 'bluesky', 'mastodon'] as const;
  return [
    'hn',
    'remotive',
    ...optional.filter((k) => enabled[k]),
    ...PROXIED_SOURCES.filter((id) => enabled[id]),
  ];
}

/** Distinct sources across the board links read, the board set's keys and the feeds. A link that
 *  is not a board is not counted (fetchFeed does not read it). */
export function scanningCount({
  boardUrls,
  setKeys = new Set(),
  feeds = feedKeys(),
}: {
  boardUrls: readonly string[];
  /** The board set's keys (a Set: thousands of them, counted on every render of the line). */
  setKeys?: ReadonlySet<string>;
  feeds?: readonly string[];
}): number {
  const extra = new Set<string>();
  for (const k of feeds) if (!setKeys.has(k)) extra.add(k);
  for (const url of boardUrls) {
    const b = parseBoardUrl(url);
    if (b && !setKeys.has(setBoardKey(b))) extra.add(setBoardKey(b));
  }
  return setKeys.size + extra.size;
}

let setKeys: ReadonlySet<string> | null = null;
let loading: Promise<ReadonlySet<string>> | null = null;

/** The board set's keys, read from the lazy chunk once per page load. */
export function loadBoardSetKeys(): Promise<ReadonlySet<string>> {
  if (setKeys) return Promise.resolve(setKeys);
  loading ??= importFresh(() => import('./data/board-keys.json'))()
    .then((m) => (setKeys = new Set(keysFromCompact(m.default))))
    .catch((e: unknown) => {
      loading = null;
      throw e;
    });
  return loading;
}

/** Tests: forget the loaded keys. */
export function resetBoardSetKeys(): void {
  setKeys = null;
  loading = null;
}

/** How many sources are scanned: `boardUrls` are the boards this browser's scan reads
 *  (autoScan.ts `scanBoardUrls`). Undefined while a signed-in person's board set loads (or if its
 *  chunk failed), so the line never shows a number it will take back. */
export function useScanningCount(boardUrls: readonly string[], signedIn: boolean) {
  const [keys, setLoaded] = useState<ReadonlySet<string> | null>(() => (signedIn ? setKeys : null));
  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    loadBoardSetKeys().then(
      (k) => live && setLoaded(k),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [signedIn]);
  if (!signedIn) return scanningCount({ boardUrls });
  const loaded = keys ?? setKeys;
  return loaded ? scanningCount({ boardUrls, setKeys: loaded }) : undefined;
}
