// Which keyless aggregators are on (fetchFeed.ts reads it; re-exported there). Its own module so
// the v12 move (v12Migration.ts) can read it without the feed's fetch code.
import type { ServerFeed } from '../tracks/feeds/serverFeeds.ts';
import type { ProxiedId } from './sources/proxiedIds.ts';

/** Per-source switch for the keyless aggregators we have not yet seen answer from a browser (no CORS
 *  proof from the build sandbox). Turn one off here if its first deployed check shows it blocked.
 *  A failure is already isolated and named per source either way. Remote OK stays off until its
 *  API's own legal notice has been read from a network that reaches it and its terms are checked
 *  against this adapter (#178): an attribution source does not ship on a guess of its terms.
 *  Bluesky stays off until a deployed check shows its public search answers logged out
 *  (sources/bluesky.ts). Reddit is not here at all: its Data API Terms need a registered OAuth
 *  app, never keyless browser reads (sources/reddit.ts says how to read it server-side). */
export const SOURCE_ENABLED: Record<
  'jobicy' | 'remoteok' | 'bluesky' | 'mastodon' | ProxiedId | 'dsjobsCatalog' | ServerFeed,
  boolean
> = {
  jobicy: true,
  remoteok: false,
  bluesky: false,
  mastodon: true,
  // Read through /api/boards (sources/proxied.ts). designsystems.jobs is verified live. We Work
  // Remotely is off by the rule above: its RSS feeds and their terms ("attribute the links back")
  // have not been read from a network that reaches the host, so it waits like Remote OK. The other
  // three wait on their terms or their feed being read live (each adapter's header says which).
  dsjobs: true,
  wwr: false,
  workingnomads: false,
  himalayas: false,
  authenticjobs: false,
  // Read by the sync edge function only (src/tracks/feeds; the browser never contacts them).
  // designsystems.jobs' whole catalog (sitemap + each job page) is verified live; off, the sync
  // reads its RSS alone. The rest are off until their gate opens: TheirStack (THEIRSTACK_API_KEY),
  // Adzuna (ADZUNA_APP_ID + ADZUNA_APP_KEY, and Adzuna's yes to commercial use) and Jooble
  // (JOOBLE_API_KEY) need keys, and fail loud naming the env var when on without them; Into Design
  // Systems waits on its operator's permission.
  dsjobsCatalog: true,
  theirstack: false,
  adzuna: false,
  jooble: false,
  ids: false,
};
