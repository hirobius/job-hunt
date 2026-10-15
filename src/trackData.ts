// Per-track user data (outreach targets, saved searches, work mode) is keyed by track id. When a
// track goes, its entries go too, so the synced blob does not grow orphans (ADR 0008). Evidence is
// one text for the account, not per track, so it is untouched.
import { getAllTargets, replaceTargets } from './feed/targets';
import { getAllFilters, replaceFilters } from './feed/savedFilters';
import { getAllModes, replaceModes } from './trackModes';

function filterKeys<T>(
  all: Record<string, T>,
  keep: (id: string) => boolean,
): Record<string, T> | null {
  const ids = Object.keys(all);
  if (ids.every(keep)) return null; // nothing to prune: no write, no notify
  return Object.fromEntries(Object.entries(all).filter(([id]) => keep(id)));
}

function prune(keep: (id: string) => boolean) {
  const t = filterKeys(getAllTargets(), keep);
  if (t) replaceTargets(t);
  const f = filterKeys(getAllFilters(), keep);
  if (f) replaceFilters(f);
  const m = filterKeys(getAllModes(), keep);
  if (m) replaceModes(m);
}

/** A track was deleted. */
export const dropTrackData = (id: string) => prune((x) => x !== id);

/** Keep only these tracks' data (after a sync has settled which tracks exist). */
export const keepOnlyTracks = (ids: ReadonlySet<string>) => prune((x) => ids.has(x));
