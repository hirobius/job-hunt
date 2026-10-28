// Which keyless aggregators are on (fetchFeed.ts reads it; re-exported there). Its own module so
// the v12 move (v12Migration.ts) can read it without the feed's fetch code.
/** Per-source switch for the keyless aggregators we have not yet seen answer from a browser (no CORS
 *  proof from the build sandbox). Turn one off here if its first deployed check shows it blocked.
 *  A failure is already isolated and named per source either way. Remote OK stays off until its
 *  API's own legal notice has been read from a network that reaches it and its terms are checked
 *  against this adapter (#178): an attribution source does not ship on a guess of its terms. */
export const SOURCE_ENABLED: Record<'jobicy' | 'remoteok', boolean> = {
  jobicy: true,
  remoteok: false,
};
