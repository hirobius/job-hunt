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
  | 'sam'
  // designsystems.jobs: read on the server only (the sync), so it reaches the app as a stored row.
  | 'rss';

export const SOURCE_LABEL: Record<FeedSourceId, string> = {
  hn: 'Hacker News',
  remotive: 'Remotive',
  jobicy: 'Jobicy',
  remoteok: 'Remote OK',
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
  sam: 'SAM.gov',
  rss: 'designsystems.jobs',
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
  /** Plain-text body (HTML stripped) — what the matcher searches. */
  text: string;
  /** Yearly pay as the source states it; absent when it doesn't. Never parsed from free text. */
  salaryMin?: number;
  salaryMax?: number;
  /** ISO currency code ('USD'); absent when the source doesn't say. */
  currency?: string;
  /** A solicitation's response deadline (YYYY-MM-DD, SAM.gov only): saved as the job's
   *  follow-up date. */
  deadline?: string;
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
