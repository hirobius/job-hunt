// What a stored verdict was scored with (2026-11-15). A rejected row keeps no description, so the
// Greenhouse delta read could never reuse one: every rejected job looked new, a board had more than
// 25 "changed" jobs, and each run fell back to the full list (2 to 3 MB a board). That was the CPU
// that stopped the sync. A rejected row may be reused without its text only when nothing that
// decided the verdict has moved: the posting (its stamp, title, link and place, checked in
// sync.ts) and the rules, which this key names. Pure: the edge function and the tests load it.
import type { TrackConfig } from './track-config.ts';

/** Bump when score.ts, scoreForTrack.ts (the fit rule) or designRoleGuard.ts change what a
 *  posting scores as without changing the config: every stored verdict is then scored again. */
export const SCORE_RULES = 2;

/** The key of a scorer config: FNV-1a over the rules version and the whole config. Two plans with
 *  the same key give every posting the same verdict. */
export function scoreKey(config: TrackConfig): string {
  const json = JSON.stringify([SCORE_RULES, config]);
  let h = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) h = Math.imul(h ^ json.charCodeAt(i), 0x01000193);
  return `${SCORE_RULES}:${(h >>> 0).toString(16)}`;
}

/** A stored rejected row, as the loader returns it. */
export interface RejectRow {
  title: string;
  url: string;
  location: string | null;
  /** The source's last-changed stamp. */
  sourceUpdatedAt: string | null;
  /** The key it was scored with. */
  scoreKey: string | null;
}

/** What the board's light list says about a job now. */
export interface LightMeta {
  title: string;
  url: string;
  location?: string;
  updatedAt?: string;
}

/** Is a stored rejected row still the truth for this job under `key`? Only when the rules are
 *  the same and the posting has not moved: the same stamp (as instants; the board's offset format
 *  and the database's differ), title, link and place. A job with no stamp on either side is never
 *  reused: reuse has to be provable, not likely. */
export function sameReject(row: RejectRow | undefined, meta: LightMeta, key: string): boolean {
  if (!row || !row.scoreKey || row.scoreKey !== key) return false;
  const now = meta.updatedAt ? Date.parse(meta.updatedAt) : NaN;
  const then = row.sourceUpdatedAt ? Date.parse(row.sourceUpdatedAt) : NaN;
  if (Number.isNaN(now) || now !== then) return false;
  return (
    row.title === meta.title &&
    row.url === meta.url &&
    (row.location ?? '') === (meta.location ?? '')
  );
}
