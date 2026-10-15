// CloudSync's user-facing status copy, kept out of the component module (fast-refresh) and
// shared with its tests.

/** Shown whenever a pull or push fails — says what happened AND that nothing is lost. */
export const OFFLINE_MSG =
  "Cloud unreachable — changes are saved on this device and will sync when it's back.";

/** A track change the cloud refused (curationStore's mirror): what happened, then the fix. */
export const TRACK_WRITE_FAILED = {
  title: 'Track changes didn’t reach the cloud',
  description: 'They’re kept on this device. Use Retry sync in the Account menu to send them.',
};

/** Asked before sign-out wipes this browser while some tracks never reached the cloud. */
export const UNSYNCED_SIGN_OUT =
  'Some of your tracks haven’t reached the cloud yet. Signing out deletes them from this browser. Sign out anyway?';

/** Child → parent, so erasure never depends on the FK cascade. */
export const DELETE_ORDER = ['tiles', 'groups', 'categories', 'tracker'] as const;

export const deleteFailedMsg = (failed: readonly string[]) =>
  `Deleted ${DELETE_ORDER.length - failed.length} of ${DELETE_ORDER.length} — couldn't delete ${failed.join(', ')}. Your local copy was kept; try again.`;
