// Live postings feed (Discover → "Live postings") — the shared model every source adapter
// normalizes into. A Posting is a raw opening pulled from a public, keyless, CORS-open API at view
// time; it is never stored. Saving one turns it into a tracked Job (src/types.ts) by URL.
import type { ScoreResult } from '../tracks/score.ts';
import type { JobMode } from '../types.ts';

export type FeedSourceId =
  | 'hn'
  | 'remotive'
  | 'jobicy'
  | 'remoteok'
  | 'dsjobs'
  | 'wwr'
  | 'workingnomads'
  | 'himalayas'
  | 'authenticjobs'
  | 'greenhouse'
  | 'lever'
  | 'ashby'
  | 'workable'
  | 'recruitee'
  | 'smartrecruiters'
  | 'teamtailor'
  | 'personio'
  | 'bamboohr'
  | 'rippling'
  | 'gem'
  | 'pinpoint'
  | 'breezy'
  | 'bluesky'
  | 'mastodon'
  | 'reddit'
  // designsystems.jobs: read on the server only (the sync), so it reaches the app as a stored row.
  | 'rss'
  // The sync's own searches (src/tracks/feeds): stored rows only, like 'rss'.
  | 'theirstack'
  | 'adzuna'
  | 'jooble'
  | 'ids'
  | 'arbeitnow';

export const SOURCE_LABEL: Record<FeedSourceId, string> = {
  hn: 'Hacker News',
  remotive: 'Remotive',
  jobicy: 'Jobicy',
  remoteok: 'Remote OK',
  dsjobs: 'designsystems.jobs',
  wwr: 'We Work Remotely',
  workingnomads: 'Working Nomads',
  himalayas: 'Himalayas',
  authenticjobs: 'Authentic Jobs',
  greenhouse: 'Greenhouse',
  lever: 'Lever',
  ashby: 'Ashby',
  workable: 'Workable',
  recruitee: 'Recruitee',
  smartrecruiters: 'SmartRecruiters',
  teamtailor: 'Teamtailor',
  personio: 'Personio',
  bamboohr: 'BambooHR',
  rippling: 'Rippling',
  gem: 'Gem',
  pinpoint: 'Pinpoint',
  breezy: 'Breezy HR',
  rss: 'designsystems.jobs',
  theirstack: 'TheirStack',
  // Adzuna's terms: every result shows "Jobs by Adzuna".
  adzuna: 'Jobs by Adzuna',
  jooble: 'Jooble',
  ids: 'Into Design Systems',
  // Its terms: link back to Arbeitnow (each row links to its Arbeitnow page) and name it.
  arbeitnow: 'Arbeitnow',
  bluesky: 'Bluesky',
  mastodon: 'Mastodon',
  reddit: 'Reddit',
};

export interface Posting {
  /** `${source}:${nativeId}` — stable across refetches. */
  id: string;
  source: FeedSourceId;
  title: string;
  company: string;
  /** Where the user goes to read/apply. Also the Job key once saved. */
  url: string;
  /** Free-text location as the source gave it; '' when unknown. */
  location: string;
  mode?: JobMode;
  /** ISO timestamp; undefined when the source doesn't say. */
  postedAt?: string;
  /** The source's own last-changed stamp for this job (Greenhouse's `updated_at`), when it
   *  gives one. The server sync compares it against the stored row to reuse a description
   *  instead of downloading it again (#448 delta reads); the browser ignores it. */
  updatedAt?: string;
  /** Plain-text body (HTML stripped) — what the matcher searches. */
  text: string;
  /** Yearly pay as the source states it; absent when it doesn't. Never parsed from free text. */
  salaryMin?: number;
  salaryMax?: number;
  /** ISO currency code ('USD'); absent when the source doesn't say. */
  currency?: string;
  /** When applications close (YYYY-MM-DD), where the source says: Greenhouse's application
   *  deadline, Teamtailor's end date. Saved as the job's `deadline`. */
  deadline?: string;
  /** Remote only (feed/autoScan.ts): the posting states no work mode or place, so it may not be
   *  remote. Shown as "Remote not stated". */
  remoteUnstated?: true;
  /** When this browser's feed first read it (ISO), stamped by the source's fetch (#419). */
  discoveredAt?: string;
  /** The track scorer's verdict and reasons (src/tracks), on a scored track only. */
  trackScore?: ScoreResult;
}

export type SignalId = 'contract' | 'founding';

export interface Signal {
  id: SignalId;
  label: string;
  /** The matched words, shown as the tag's tooltip so a signal is never unexplained. */
  evidence: string;
}

export interface RankedPosting extends Posting {
  score: number;
  /** Where the search term was found. */
  hit: 'title' | 'text';
  signals: Signal[];
  /** ~200 chars of body around the first term hit. */
  snippet: string;
}
