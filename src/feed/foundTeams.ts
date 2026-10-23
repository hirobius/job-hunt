// The Companies tool's found list (GitHub teams or suggested companies): what each run adds to.
// 2026-10-23: Find more emptied the list before searching again, so a run GitHub held back (rate
// limit, a search page cache past its day) left only the watched boards. A run only adds now.
import type { Board } from './sources/ats';

export interface FoundRow {
  login: string;
  board?: Board;
  openRoles?: number;
  /** Why there is no board when it isn't "none" (dsOrgs.ts OrgTarget). */
  boardCheck?: 'unknown' | 'unchecked';
}

/** A row found again takes the place of the one it repeats (by login, ignoring case); a new one goes
 *  last. Nothing already listed is dropped. A repeat that knows less (not looked up this time, or
 *  its board check got no answer) keeps what the list already knew. */
export function addFound<R extends FoundRow>(list: readonly R[], row: R): R[] {
  const at = list.findIndex((p) => p.login.toLowerCase() === row.login.toLowerCase());
  if (at < 0) return [...list, row];
  if (row.boardCheck === 'unchecked') return [...list];
  const prev = list[at];
  const board = row.board ?? prev.board;
  const next: R = {
    ...prev,
    ...row,
    board,
    openRoles: row.board ? row.openRoles : prev.openRoles,
    boardCheck: board ? undefined : row.boardCheck,
  };
  return list.map((p, i) => (i === at ? next : p));
}

// Kept on this device (Adrian 2026-10-23: "keep found teams on device"): per track in local storage,
// so the list survives a reload. A device cache like `rjb_probe`: never synced, not in the blob.
// Storage is untrusted, and a frozen tab's writes are dropped by the storage guard (#288).
export const FOUND_KEY_PREFIX = 'rjb_found_teams:';
export const MAX_FOUND = 500;
export const foundKey = (trackId: string) => `${FOUND_KEY_PREFIX}${trackId}`;

const isRow = (r: unknown): r is FoundRow =>
  typeof r === 'object' &&
  r !== null &&
  typeof (r as FoundRow).login === 'string' &&
  !!(r as FoundRow).login;

/** The stored list for a track; anything unreadable is nothing. */
export function loadFound<R extends FoundRow>(trackId: string): R[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(foundKey(trackId)) ?? 'null');
    return Array.isArray(parsed) ? (parsed.filter(isRow) as R[]) : [];
  } catch {
    return [];
  }
}

/** Newest last, so the cap keeps the tail. `dropped` is how many the cap pushed out. */
export function capFound<R>(list: readonly R[]): { list: R[]; dropped: number } {
  const dropped = Math.max(0, list.length - MAX_FOUND);
  return { list: dropped ? list.slice(dropped) : [...list], dropped };
}

/** Add-only: merges `list` into what is stored (a stale tab or a short run never shrinks it), caps
 *  it, writes it, and returns the result with the count the cap dropped. */
export function saveFound<R extends FoundRow>(
  trackId: string,
  list: readonly R[],
): { list: R[]; dropped: number } {
  const merged = list.reduce<R[]>(addFound, loadFound<R>(trackId));
  const out = capFound(merged);
  try {
    localStorage.setItem(foundKey(trackId), JSON.stringify(out.list));
  } catch {
    /* full or blocked: the in-memory list still works */
  }
  return out;
}

export function clearFound(trackId: string): void {
  try {
    localStorage.removeItem(foundKey(trackId));
  } catch {
    /* blocked */
  }
}
