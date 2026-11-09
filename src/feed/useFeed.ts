// Review new's data (simplify 5/9, #386): the Feed's inputs, read from the synced Search profile
// and Sources (blob v12; since #388, in place of the active track's stores), one read through the
// reader, and the view built from it. What was read is kept for this page load (viewMemory), so
// opening a posting and coming Back shows the same rows with no new read; Refresh reads again.
import { useContext, useEffect, useMemo, useState } from 'react';
import { CloudSyncContext } from '../account/accountContext';
import { serverFirstReader } from './serverFeed';
import { dedupKey, useJobs } from '../store';
import { useRemembered } from '../viewMemory';
import { useProfile } from '../profile';
import { useSources } from '../sources';
import { noteSeen, readSeen, useDecided } from './decided';
import { feedSourcesOf, searchProfileOf, type SearchProfile, type Source } from './profile';
import {
  buildFeed,
  feedRequest,
  fingerprintsOf,
  loadLastRead,
  saveLastRead,
  type FeedView,
} from './feed';
import { browserReader, type PostingReader } from './reader';
import { scanReader, useScan } from './autoScan';
import type { FeedResult } from './fetchFeed';

/** The Search profile and Sources, as the Feed reads them. */
export function useFeedInputs(): { profile: SearchProfile; sources: Source[] } {
  const stored = useProfile();
  const storedSources = useSources();
  const profile = useMemo(() => searchProfileOf(stored), [stored]);
  const sources = useMemo(() => feedSourcesOf(storedSources), [storedSources]);
  return { profile, sources };
}

interface Read {
  key: string;
  /** What this read asked for, so a source or title added later is read on its own. */
  terms: string[];
  boardUrls: string[];
  attempt: number;
  at: number;
  result?: FeedResult;
  error?: string;
  /** Boards answered so far, while reading. */
  progress?: { done: number; total: number };
  /** First-seen days, noted once the read fully answered (a board that answers late still counts
   *  as new today when it does). */
  seen?: Record<string, string>;
  /** Loaded from the last page load (#448): shown at once, never folded into a new read. */
  stored?: boolean;
}

/** The last read kept across a reload, as the first rows on screen while a fresh read runs. */
function storedRead(): Read | null {
  const last = loadLastRead();
  if (!last || !last.result.postings.length) return null;
  return {
    key: '',
    terms: [],
    boardUrls: [],
    attempt: -1,
    at: last.at,
    result: last.result,
    seen: readSeen(),
    stored: true,
  };
}

// Once a second while boards answer (was 250 ms: each repaint re-ranks every posting read so far,
// which held a phone's main thread for most of a minute; 2026-11-07).
const REPAINT_MS = 1000;

export interface FeedState {
  view: FeedView | null;
  profile: SearchProfile;
  sources: Source[];
  loading: boolean;
  progress?: { done: number; total: number };
  error?: string;
  /** When the rows on screen were read. */
  at: number;
  refresh: () => void;
}

export function useFeed(given?: PostingReader): FeedState {
  // Signed in, Review new reads the server's rows (serverFeed.ts; the browser sweep only when the
  // server has none). Either way it adds what the auto-scan kept (feed/autoScan.ts). Read from the
  // context directly: Review new also renders outside the provider in tests.
  const sync = useContext(CloudSyncContext);
  const signedIn = !!sync?.user;
  // Held behind the sign-in screen (2026-11-09): no read starts and the rows are not rebuilt
  // while it is open; a read in flight stops, and the same read resumes once it closes.
  const held = !!sync?.signInOpen;
  const reader = useMemo(
    () => given ?? scanReader(signedIn ? serverFirstReader(liveReader) : liveReader),
    [given, signedIn],
  );
  const { profile, sources } = useFeedInputs();
  const decided = useDecided();
  const jobs = useJobs();
  const req = useMemo(() => feedRequest(profile, sources), [profile, sources]);
  // A finished scan, or a New company followed or ignored, changes what the scan reader adds.
  const scan = useScan().state;
  // Not the companies a run in progress adds: only a finished run or a Follow / Ignore re-reads.
  const scanKey = `${scan.finishedAt ?? 0}:${scan.found
    .filter((f) => f.status !== 'new')
    .map((f) => `${f.key}=${f.status}`)
    .join(',')}`;
  const key = `${signedIn ? 'server' : 'browser'}|${req.terms.join('\n')}|${req.boardUrls.join('\n')}|${scanKey}`;
  const [read, setRead] = useRemembered<Read | null>('review:read', storedRead);
  const [attempt, setAttempt] = useRemembered('review:attempt', 0);
  const hasQuery = req.terms.length > 0 || req.boardUrls.length > 0;

  useEffect(() => {
    if (!hasQuery || held) return;
    if (read && read.key === key && read.attempt === attempt && !read.progress && !read.error)
      return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();
    // First-seen days as they stood before this read (noted again once it fully answers).
    const seenBefore = readSeen();
    // A company or title added since the last full read (Adrian 2026-10-28: a new company's jobs
    // show straight away): read only what was added and fold it into the rows already up.
    const base =
      read?.result && !read.stored && !read.progress && !read.error && read.attempt === attempt
        ? read
        : null;
    const added = base && {
      terms: req.terms.filter((t) => !base.terms.includes(t)),
      boardUrls: req.boardUrls.filter((u) => !base.boardUrls.includes(u)),
    };
    const onlyAdded =
      !!base &&
      !!added &&
      base.terms.every((t) => req.terms.includes(t)) &&
      base.boardUrls.every((u) => req.boardUrls.includes(u));
    const ask = onlyAdded && added ? added : req;
    const fold = (r: FeedResult): FeedResult =>
      onlyAdded && base?.result ? mergeReads(base.result, r) : r;
    const done = (result: FeedResult, at: number, progress?: Read['progress']) =>
      setRead({
        key,
        terms: req.terms,
        boardUrls: req.boardUrls,
        attempt,
        at,
        result,
        ...(progress
          ? { progress, seen: seenBefore }
          : { seen: noteSeen(fingerprintsOf(result), at) }),
      });
    // Signed in, a company or title added since the last read is read in the browser: the server
    // has not read it yet (its sync runs every 15 minutes), and its jobs show at once.
    const by = onlyAdded && signedIn ? browserFirst : reader;
    by.read(ask, (p) => {
      if (!alive || timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        if (alive)
          done(fold({ postings: p.postings, sources: p.sources }), startedAt, {
            done: p.boardsDone,
            total: p.boardsTotal,
          });
      }, REPAINT_MS);
    })
      .then((result) => {
        clearTimeout(timer);
        timer = undefined;
        if (alive) done(fold(result), Date.now());
      })
      .catch(() => {
        clearTimeout(timer);
        if (alive)
          setRead({
            key,
            terms: req.terms,
            boardUrls: req.boardUrls,
            attempt,
            at: Date.now(),
            error: 'The feed failed unexpectedly. Try again.',
          });
      });
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // req derives from key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt, hasQuery, reader, signedIn, held]);

  // The rows of the last read stay up while a changed request is read (never a blank list).
  const current = read?.result || read?.key === key ? read : null;
  const updating = !!current && (current.key !== key || !!current.progress);
  const saved = useMemo(() => new Set(jobs.map((j) => dedupKey(j.url))), [jobs]);
  // Behind the sign-in screen the rows on screen stay as they were (no rebuild); see `held`.
  const [shown, setShown] = useState<FeedView | null>(null);
  const built = useMemo(
    () =>
      held
        ? shown
        : current?.result
          ? buildFeed(current.result, profile, sources, {
              now: current.at,
              decided,
              seen: current.seen ?? {},
              saved,
            })
          : null,
    // `shown` is read only while held, and never changes then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [held, current, profile, sources, decided, saved],
  );
  if (!held && built !== shown) setShown(built);
  const view = built;
  // A fresh, fully answered read is kept for the next page load.
  useEffect(() => {
    if (view && current?.result && !current.stored && !current.progress && !current.error)
      saveLastRead(current.result, view, current.at);
    // Only when the read itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.result, current?.at]);
  return {
    view,
    profile,
    sources,
    loading: hasQuery && (!current || (updating && !view?.rows.length)),
    progress:
      current?.progress ?? (updating ? { done: 0, total: req.boardUrls.length } : undefined),
    error: current?.error,
    at: current?.at ?? 0,
    refresh: () => setAttempt((n) => n + 1),
  };
}

const liveReader = browserReader();
const browserFirst = scanReader(liveReader);

/** A read of only what was added, folded into the one before it: its postings after the old
 *  ones (a posting read twice kept once), its sources' statuses added. */
export function mergeReads(before: FeedResult, added: FeedResult): FeedResult {
  const have = new Set(before.postings.map((p) => p.id));
  const keys = new Set(added.sources.map((s) => s.key));
  return {
    postings: [...before.postings, ...added.postings.filter((p) => !have.has(p.id))],
    sources: [...before.sources.filter((s) => !keys.has(s.key)), ...added.sources],
  };
}
