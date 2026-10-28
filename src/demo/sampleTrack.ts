// The "Sample" track the sample data adds to a board with none (#107). It is sample data like the
// sample's jobs: it lives on this device only, and a sign-in drops it before anything is counted
// or synced, so it never reaches an account (it is a real track, so sync would otherwise upload it
// with its links and targets, and the merge guard would ask about it). Kept apart from
// loadSample.ts so the account seam can drop it without loading the starter packs.
import { getCurationState, replaceCurationState } from '../curation/curationStore';
import { loadPersisted, savePersisted } from '../persisted';
import { dropTrackData } from '../trackData';

/** The id of the track the sample added (device-local: the sample is only offered signed out). */
export const SAMPLE_TRACK_KEY = 'rjb_sample_track';

export function rememberSampleTrack(id: string) {
  savePersisted(SAMPLE_TRACK_KEY, id);
}

/** Remove the Sample track, if it is still there, from this device only: it, its sections and
 *  links, and its per-track data. Never mirrored to the cloud, which never had it. */
export function dropSampleTrack() {
  const id = loadPersisted<string | null>(SAMPLE_TRACK_KEY, null);
  if (!id) return;
  const s = getCurationState();
  if (s.categories.some((c) => c.id === id)) {
    const groups = new Set(s.groups.filter((g) => g.categoryId === id).map((g) => g.id));
    replaceCurationState({
      categories: s.categories.filter((c) => c.id !== id),
      groups: s.groups.filter((g) => !groups.has(g.id)),
      tiles: s.tiles.filter((t) => !groups.has(t.groupId)),
    });
  }
  dropTrackData(id);
  savePersisted(SAMPLE_TRACK_KEY, null);
}
