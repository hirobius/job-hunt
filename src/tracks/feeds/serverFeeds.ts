// The sync's own searches (docs/research/ds-job-sources.md): sources only the server reads, shared
// by every design-systems user. Each adapter's header has its terms, attribution and rate limit.
// SERVER_FEED_GATES says when each runs: the keyless ones always; a keyed one as soon as any of its
// Supabase function secrets is set (with one missing, its read fails loud naming it, and the run
// goes on); Into Design Systems only on its operator's yes. They are windowed reads, never a
// whole catalog, so a posting missing from one read is never closed as gone (plan.ts
// `answeredFeeds`): it ages out instead.
import type { NormalizedPosting } from '../score.ts';
import { ADZUNA_ENV, readAdzuna } from './adzuna.ts';
import { readArbeitnow } from './arbeitnow.ts';
import type { FeedContext } from './context.ts';
import { readIntoDesignSystems } from './intoDesignSystems.ts';
import { JOOBLE_ENV, readJooble } from './jooble.ts';
import { readRemoteOk } from './remoteok.ts';
import { readTheirStack, THEIRSTACK_ENV } from './theirstack.ts';
import { readFourDayWeek } from './fourdayweek.ts';
import { readRemoteJobsOrg } from './remotejobsorg.ts';
import { readGetOnBrd } from './getonbrd.ts';
import { readOsdJobs } from './osdjobs.ts';
import { readJobgether } from './jobgether.ts';

export type ServerFeed =
  | 'arbeitnow'
  | 'remoteok'
  | 'theirstack'
  | 'adzuna'
  | 'jooble'
  | 'ids'
  | 'fourdayweek'
  | 'remotejobsorg'
  | 'getonbrd'
  | 'osdjobs'
  | 'jobgether';
export const SERVER_FEEDS: readonly ServerFeed[] = [
  'ids',
  'arbeitnow',
  'remoteok',
  'theirstack',
  'adzuna',
  'jooble',
  'fourdayweek',
  'remotejobsorg',
  'getonbrd',
  'osdjobs',
  'jobgether',
];

export const SERVER_FEED_READERS: Record<
  ServerFeed,
  (ctx: FeedContext) => Promise<NormalizedPosting[]>
> = {
  arbeitnow: readArbeitnow,
  remoteok: readRemoteOk,
  theirstack: readTheirStack,
  adzuna: readAdzuna,
  jooble: readJooble,
  ids: readIntoDesignSystems,
  fourdayweek: readFourDayWeek,
  remotejobsorg: readRemoteJobsOrg,
  getonbrd: readGetOnBrd,
  osdjobs: readOsdJobs,
  jobgether: readJobgether,
};

/** The server feeds read whole every run (#576 item 11): Remote OK's one list and We Work
 *  Remotely's two category feeds. A posting missing from 2 whole reads in a row closes as missed
 *  (mark_missed_postings), like a company board's. Arbeitnow is not one: it reads the newest
 *  ARBEITNOW_PAGES pages, a window, so it ages out with the keyed searches. */
export const WHOLE_LIST_FEEDS: readonly ServerFeed[] = ['remoteok'];

type Gate = { keyless: true } | { env: readonly string[] } | { waitsOn: string };

/** When each feed runs. Into Design Systems waits on its operator (no key to set). */
export const SERVER_FEED_GATES: Record<ServerFeed, Gate> = {
  arbeitnow: { keyless: true },
  remoteok: { keyless: true },
  theirstack: { env: THEIRSTACK_ENV },
  adzuna: { env: ADZUNA_ENV },
  jooble: { env: JOOBLE_ENV },
  ids: { waitsOn: "its operator's yes" },
  fourdayweek: { keyless: true },
  remotejobsorg: { keyless: true },
  getonbrd: { keyless: true },
  osdjobs: { keyless: true },
  jobgether: { keyless: true },
};

type Env = (name: string) => string | undefined;
const isSet = (env: Env, name: string) => !!env(name)?.trim();

/** The feed runs on this deploy: keyless, or any of its secrets is set. */
export function serverFeedOn(feed: ServerFeed, env: Env): boolean {
  const g = SERVER_FEED_GATES[feed];
  if ('keyless' in g) return true;
  if ('env' in g) return g.env.some((n) => isSet(env, n));
  return false;
}

/** True for a feed that spends a paid or capped key (TheirStack, Adzuna, Jooble). */
export const isKeyed = (feed: ServerFeed) => 'env' in SERVER_FEED_GATES[feed];

/** The server feeds one feeds run reads (#576 item 3). The 14:23 run sends `keyed: false`: it reads
 *  the keyless feeds again but not the keyed ones, so each key's daily budget (theirstack.ts,
 *  adzuna.ts, jooble.ts) is spent once a day, as before. */
export const serverFeedsForRun = (env: Env, keyed: boolean): ServerFeed[] =>
  SERVER_FEEDS.filter((f) => serverFeedOn(f, env) && (keyed || !isKeyed(f)));

/** The feeds not running, each with what turns it on (env var names, never values). */
export function serverFeedsOff(env: Env): Partial<Record<ServerFeed, string>> {
  const out: Partial<Record<ServerFeed, string>> = {};
  for (const f of SERVER_FEEDS) {
    if (serverFeedOn(f, env)) continue;
    const g = SERVER_FEED_GATES[f];
    out[f] = 'env' in g ? g.env.join(', ') : 'waitsOn' in g ? g.waitsOn : '';
  }
  return out;
}
