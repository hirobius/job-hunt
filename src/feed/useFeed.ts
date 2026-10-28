// Review new's data (simplify 5/9, #386): the Feed's inputs read from today's stores (the thin
// adapter until #384/#385's `useProfile` / `useSources` land), one read through the reader, and the
// view built from it. What was read is kept for this page load (viewMemory), so opening a posting
// and coming Back shows the same rows with no new read; Refresh reads again.
import { useEffect, useMemo } from 'react';
import { useCategories, useGroups, useTiles } from '../curation/curationStore';
import { useTrackContext } from '../discoverContext';
import { dedupKey, useJobs } from '../store';
import { useRemembered } from '../viewMemory';
import { useDreams } from './dreams';
import { useTargets } from './targets';
import { useMustInclude } from './mustInclude';
import { useSweep } from './sweepTitles';
import { boardUrlsFor } from './watchlist';
import { noteSeen, readSeen, useDecided } from './decided';
import { profileFrom, sourcesFrom, type SearchProfile, type Source } from './profile';
import { buildFeed, feedRequest, fingerprintsOf, type FeedView } from './feed';
import { browserReader, type PostingReader } from './reader';
import type { FeedResult } from './fetchFeed';

/** The Search profile and Sources of a track, from today's stores. */
export function useFeedInputs(categoryId: string): { profile: SearchProfile; sources: Source[] } {
  const categories = useCategories();
  const groups = useGroups();
  const tiles = useTiles();
  const track = categories.find((c) => c.id === categoryId);
  const titleSeed = track ? (track.titles.length ? track.titles : track.atsRoles) : [];
  const sweep = useSweep(categoryId, titleSeed);
  const include = useMustInclude(categoryId);
  const { where, mode } = useTrackContext(categoryId);
  const dreams = useDreams(categoryId);
  const targets = useTargets(categoryId);
  const decided = useDecided();
  const profile = useMemo(
    () =>
      profileFrom({
        atsRoles: track?.atsRoles ?? [],
        seniority: track?.seniority ?? 'any',
        sweep,
        include,
        where,
        mode,
      }),
    [track?.atsRoles, track?.seniority, sweep, include, where, mode],
  );
  const sources = useMemo(
    () =>
      sourcesFrom({
        tileUrls: boardUrlsFor(categoryId, { categories, groups, tiles }),
        dreams,
        targets,
        muted: decided.muted,
        followed: decided.followed,
      }),
    [categoryId, categories, groups, tiles, dreams, targets, decided.muted, decided.followed],
  );
  return { profile, sources };
}

interface Read {
  key: string;
  attempt: number;
  at: number;
  result?: FeedResult;
  error?: string;
  /** Boards answered so far, while reading. */
  progress?: { done: number; total: number };
  /** First-seen days, noted once the read fully answered (a board that answers late still counts
   *  as new today when it does). */
  seen?: Record<string, string>;
}

const REPAINT_MS = 250;

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

export function useFeed(categoryId: string, reader: PostingReader = defaultReader): FeedState {
  const { profile, sources } = useFeedInputs(categoryId);
  const decided = useDecided();
  const jobs = useJobs();
  const req = useMemo(() => feedRequest(profile, sources), [profile, sources]);
  const key = `${req.terms.join('\n')}|${req.boardUrls.join('\n')}`;
  const [read, setRead] = useRemembered<Read | null>(`review:${categoryId}:read`, null);
  const [attempt, setAttempt] = useRemembered(`review:${categoryId}:attempt`, 0);
  const hasQuery = req.terms.length > 0 || req.boardUrls.length > 0;

  useEffect(() => {
    if (!hasQuery) return;
    if (read && read.key === key && read.attempt === attempt && !read.progress && !read.error)
      return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();
    // First-seen days as they stood before this read (noted again once it fully answers).
    const seenBefore = readSeen();
    reader
      .read(req, (p) => {
        if (!alive || timer) return;
        timer = setTimeout(() => {
          timer = undefined;
          if (alive)
            setRead({
              key,
              attempt,
              at: startedAt,
              result: { postings: p.postings, sources: p.sources },
              progress: { done: p.boardsDone, total: p.boardsTotal },
              seen: seenBefore,
            });
        }, REPAINT_MS);
      })
      .then((result) => {
        clearTimeout(timer);
        timer = undefined;
        if (!alive) return;
        const at = Date.now();
        setRead({ key, attempt, at, result, seen: noteSeen(fingerprintsOf(result), at) });
      })
      .catch(() => {
        clearTimeout(timer);
        if (alive)
          setRead({
            key,
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
  }, [key, attempt, hasQuery, reader]);

  const current = read && read.key === key ? read : null;
  const saved = useMemo(() => new Set(jobs.map((j) => dedupKey(j.url))), [jobs]);
  const view = useMemo(
    () =>
      current?.result
        ? buildFeed(current.result, profile, sources, {
            now: current.at,
            decided,
            seen: current.seen ?? {},
            saved,
          })
        : null,
    [current, profile, sources, decided, saved],
  );
  return {
    view,
    profile,
    sources,
    loading: hasQuery && (!current || (!!current.progress && !view?.rows.length)),
    progress: current?.progress,
    error: current?.error,
    at: current?.at ?? 0,
    refresh: () => setAttempt((n) => n + 1),
  };
}

const defaultReader = browserReader();
