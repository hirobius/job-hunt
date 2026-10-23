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
