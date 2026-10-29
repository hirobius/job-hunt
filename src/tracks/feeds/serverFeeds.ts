// The sync's own searches (docs/research/ds-job-sources.md): sources only the server reads, each a
// whole-web search for design-systems roles, shared by every design-systems user. Each adapter's
// header has its terms, attribution and rate limit; SOURCE_ENABLED (feed/sourceEnabled.ts) says
// which are on. They are windowed searches, never a whole list, so a posting missing from one
// read is never closed as gone (plan.ts `answeredFeeds`).
import type { NormalizedPosting } from '../score.ts';
import { readAdzuna } from './adzuna.ts';
import type { FeedContext } from './context.ts';
import { readIntoDesignSystems } from './intoDesignSystems.ts';
import { readJooble } from './jooble.ts';
import { readTheirStack } from './theirstack.ts';

export type ServerFeed = 'theirstack' | 'adzuna' | 'jooble' | 'ids';
export const SERVER_FEEDS: readonly ServerFeed[] = ['ids', 'theirstack', 'adzuna', 'jooble'];

export const SERVER_FEED_READERS: Record<
  ServerFeed,
  (ctx: FeedContext) => Promise<NormalizedPosting[]>
> = {
  theirstack: readTheirStack,
  adzuna: readAdzuna,
  jooble: readJooble,
  ids: readIntoDesignSystems,
};
