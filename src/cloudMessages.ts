// CloudSync's user-facing status copy, kept out of the component module (fast-refresh) and
// shared with its tests.

/** The sync-failure toast (rev-3 #s-error-toast): what happened, then that nothing is lost.
 *  OFFLINE_MSG is also the Account menu's status line while the outage lasts. */
export const OFFLINE_TITLE = "Couldn't sync";
export const OFFLINE_MSG = 'Your changes are saved on this device.';

/** Another tab changed who is signed in (#288): this tab stops syncing until a reload. */
export const TAB_FROZEN_TITLE = 'Sync stopped in this tab';
export const TAB_SWITCHED = 'You signed in as someone else in another tab. Reload to continue.';
export const TAB_SIGNED_OUT = 'You signed out in another tab. Reload to continue.';
export const TAB_NEWER_VERSION =
  'Your data was saved by a newer version of the app. Reload to continue.';
/** The menu line and toast for each reason a tab stopped (tabAccount.ts). */
export const TAB_FROZEN_MESSAGE = {
  switched: TAB_SWITCHED,
  signedOut: TAB_SIGNED_OUT,
  newerVersion: TAB_NEWER_VERSION,
} as const;

/** A track change the cloud refused (curationStore's mirror): what happened, then the fix. */
export const TRACK_WRITE_FAILED = {
  title: 'Track changes didn’t reach the cloud',
  description: 'They’re kept on this device. Use Retry sync in the Account menu to send them.',
};

/** Asked before sign-out wipes this browser while some tracks never reached the cloud. */
export const UNSYNCED_SIGN_OUT =
  'Some of your tracks haven’t reached the cloud yet. Signing out deletes them from this browser. Sign out anyway?';

/** Asked before sign-out wipes this browser while the latest edits could not be uploaded. */
export const UNSYNCED_CHANGES_SIGN_OUT =
  'Your latest changes (jobs, templates, targets, saved searches, evidence) couldn’t reach the cloud. Signing out deletes them from this browser. Sign out anyway?';

/** Child → parent, so erasure never depends on the FK cascade. */
export const DELETE_ORDER = ['tiles', 'groups', 'categories', 'tracker'] as const;

/** delete_my_data refused (#393): nothing was deleted, it runs as one transaction. */
export const DELETE_FAILED =
  "Couldn't delete your cloud data. Your local copy was kept; try again.";

export const deleteFailedMsg = (failed: readonly string[]) =>
  `Deleted ${DELETE_ORDER.length - failed.length} of ${DELETE_ORDER.length} — couldn't delete ${failed.join(', ')}. Your local copy was kept; try again.`;

/** The one action on a sync or save failure toast (rev-3 O): Reload, which is also in the Account
 *  menu under Troubleshooting. The mock's RotateCw icon waits on HDS (ToastAction has no icon slot;
 *  docs/hds-upstream-asks-0.9.md). Never Reset in a toast, and never on a bad restore file (a reload
 *  does not fix a file). */
export const RELOAD_ACTION = {
  label: 'Reload',
  onSelect: () => window.location.reload(),
  altText: 'Reload app, also in Account menu, Troubleshooting',
} as const;
