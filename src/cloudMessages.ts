// CloudSync's user-facing status copy, kept out of the component module (fast-refresh) and
// shared with its tests.

/** Shown whenever a pull or push fails — says what happened AND that nothing is lost. */
export const OFFLINE_MSG =
  "Cloud unreachable — changes are saved on this device and will sync when it's back.";

/** Child → parent, so erasure never depends on the FK cascade. */
export const DELETE_ORDER = ['tiles', 'groups', 'categories', 'tracker'] as const;

export const deleteFailedMsg = (failed: readonly string[]) =>
  `Deleted ${DELETE_ORDER.length - failed.length} of ${DELETE_ORDER.length} — couldn't delete ${failed.join(', ')}. Your local copy was kept; try again.`;
