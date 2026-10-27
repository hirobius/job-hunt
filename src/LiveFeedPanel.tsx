// Discover → "Live postings": real openings pulled at view time from public, keyless APIs — Hacker
// News "Who is hiring?", Remotive, the Greenhouse/Lever/Ashby boards this track watches and a starter
// directory of company boards — then phrase-matched and ranked by src/feed/match.ts. With the user's
// evidence, each posting also gets a fit (Role Radar's engine, src/radar/). Nothing is stored until
// the user saves a posting, which turns it into a tracked Job. Watching a board files a tile on the
// track (src/feed/watchlist.ts). "Find more" runs the wide sweep (#213): every title that is on for
// the track, in one search, merged and tagged by title (src/feed/sweep.ts).
// Layout (rev-3 mock, K/H): the search row, then Calibrate → Refine → Openings, 24 apart. Openings
// is one panel: a header (count, how it is sorted and what is hidden, Find more, a menu
// with the Show filter and Save all), a Partial row when sources failed, then hairline rows.
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  Badge,
  Card,
  Button,
  Dialog,
  Tooltip as HdsTooltip,
  Input as HdsInput,
  Menu,
  SegmentedControl,
  Checkbox as HdsCheckbox,
  Toggle,
  Disclosure,
  Skeleton,
  Stack,
  Tag,
  useToast,
  Box,
  Icon,
  Text,
  InlineLink,
  VisuallyHidden,
} from '@hirobius/design-system';
import { EmptyState } from './hds-gaps/EmptyState';
import {
  Banknote,
  Calendar,
  Check,
  ChevronRight,
  Ellipsis,
  FileSignature,
  MapPin,
  Rocket,
  Search,
  SearchX,
  X,
  type LucideIcon,
} from 'lucide-react';
import { EvidenceEditor, FitGapBody, PatternsSummary } from './FeedFit';
import { setTrackContext, useTrackContext } from './discoverContext';
import { addJobDetailed, dedupKey, updateJob, useJobs } from './store';
import { notifySaved } from './saveNotice';
import { fetchFeed, type FeedResult } from './feed/fetchFeed';
import { mergeRetry } from './feed/mergeFeed';
import { AsyncState, type AsyncStatus } from '@hirobius/design-system/patterns';
import { rankAll, rankPostings } from './feed/match';
import { SCORED_TRACK_COPY, scorerFor } from './tracks/forTrack';
import { reasonsLine } from './tracks/scoreForTrack';
import { applyTargeting, NO_TARGETING } from './feed/targeting';
import {
  hasRelatedTitles,
  RELATED_TITLES,
  relatedCounts,
  relatedIsOn,
  toggleRelated,
  setMustInclude,
  useMustInclude,
} from './feed/mustInclude';
import { ChipEditor } from './ChipEditor';
import { CardList, ListCard } from './PipelinePanel';
import type { Seniority } from './curation/types';
import { useCategories, useGroups, useTiles } from './curation/curationStore';
import { postedAgo } from './feed/format';
import { boardsFromUrls } from './feed/sources/ats';
import { deleteFilter, saveFilter, useFilters, type SavedFilter } from './feed/savedFilters';
import { addBoardTiles, countUnwatched, watchBoard } from './feed/watchlist';
import { boardsForPack, packIdForLabel } from './curation/starterPacks';
import { jobFieldsFor } from './feed/toJob';
import { modeLabel, verdictLabel } from './screening';
import { fitGap, parseEvidence, type FitGap } from './radar/fitGap';
import { demandPatterns } from './radar/patterns';
import { TIER_INFO, useEvidence, writeEvidence } from './radar/evidenceStore';
import { SOURCE_LABEL, type Signal, type SignalId } from './feed/types';
import { sweepRank, titleCounts, withoutHidden, type SweptPosting } from './feed/sweep';
import { SweepTitlesEditor } from './SweepTitles';
import { activeTitles, useSweep } from './feed/sweepTitles';
import { metaLines } from './metaLines';
import { useRemembered } from './viewMemory';
import { useArrived } from './feedback';
import { foldRoles, orderByRoleType, roleTypeOf, roleTypeTag } from './feed/roleType';
import { useRoleTypes, writeShowEngineering } from './feed/roleTypePref';
import { useBackCloses, useBackSheet } from './useBackCloses';

type Focus = 'all' | 'strong' | SignalId;
/** Rows rendered per page — the rest sit behind "Show more". */
const PAGE = 40;
/** After this long with nothing to show, the loading caption says slow sources are skipped. */
const SLOW_MS = 10_000;
/** Skeleton rows while the first answers come in, so nothing jumps when results land. */
const SKELETON_ROWS = 4;

interface Loaded {
  term: string;
  boardsKey: string;
  at: number;
  /** The Retry count it was read on (a come-back with the same count reads nothing new). */
  attempt?: number;
  result?: FeedResult;
  error?: string;
  /** Still reading boards: `result` is what has answered so far. */
  reading?: { done: number; total: number };
}

/** How often a long board read repaints the list. */
const PROGRESS_REPAINT_MS = 250;
/** Fit order for "Sorted by fit". */
const TIER_RANK: Record<FitGap['tier'], number> = { strong: 0, stretch: 1, reach: 2 };

export default function LiveFeedPanel({
  categoryId,
  terms,
  boardUrls,
  sweepSeed = terms,
  calibrate = false,
}: {
  categoryId: string;
  /** The track's search terms: the first is searched on open; all sit under Calibrate's "Search for". */
  terms: string[];
  /** The track's titles: the sweep's list until the user edits it. */
  sweepSeed?: string[];
  /** Every tile URL on the track; the feed pulls the ones that are company boards. */
  boardUrls: string[];
  /** Open with Calibrate expanded (the old Titles tool's link lands here, #223). */
  calibrate?: boolean;
}) {
  const { where, mode } = useTrackContext(categoryId);
  const { toast } = useToast();
  // What the search was doing is kept per track for this page load (viewMemory), so Save → Open →
  // Back (or the browser's Back) comes back to the same term, filters and rows (return paths).
  const kept = (k: string) => `live:${categoryId}:${k}`;
  const [input, setInput] = useRemembered(kept('input'), terms[0] ?? '');
  const [term, setTerm] = useRemembered(kept('term'), terms[0] ?? '');
  const [loaded, setLoaded] = useRemembered<Loaded | null>(kept('loaded'), null);
  /** Bumped by Retry so the same term and boards are read again. */
  const [attempt, setAttempt] = useRemembered(kept('attempt'), 0);
  /** Source keys a per-source Retry is reading right now. */
  const [retrying, setRetrying] = useState<string[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);
  const [refineOpen, setRefineOpen] = useState(false);
  const watchId = useId();
  const savedId = useId();
  const [calibrateOpen, setCalibrateOpen] = useRemembered(kept('calibrate'), calibrate);
  // Arriving through the old Titles link opens Calibrate, also when this panel is already up or
  // comes back with it closed.
  const [calibrateSeen, setCalibrateSeen] = useState(false);
  if (calibrate !== calibrateSeen) {
    setCalibrateSeen(calibrate);
    if (calibrate) setCalibrateOpen(true);
  }
  const [focus, setFocus] = useRemembered<Focus>(kept('focus'), 'all');
  const [shown, setShown] = useRemembered(kept('shown'), PAGE);
  const [watchUrl, setWatchUrl] = useState('');
  const [watchError, setWatchError] = useState('');
  const evidenceText = useEvidence();
  const track = useCategories().find((c) => c.id === categoryId);
  const trackSeniority = track?.seniority ?? 'any';
  const [excludeText, setExcludeText] = useRemembered(kept('exclude'), '');
  const [seniority, setSeniority] = useRemembered<Seniority>(kept('seniority'), trackSeniority);
  const [floorText, setFloorText] = useRemembered(kept('floor'), '');
  const [salaryOnly, setSalaryOnly] = useRemembered(kept('salaryOnly'), false);
  // Must include (2026-10-23): per track and synced, unlike the leave-out words above.
  const mustInclude = useMustInclude(categoryId);
  // A scored track (src/tracks): the scorer replaces must include, related titles and the title
  // filter, lists what it queues by score and holds the rest for review, each with its reasons.
  const scorer = scorerFor(mustInclude);
  // The track's ATS roles switched off (the systems-only move): tap one to search for it again.
  const atsOff = useMemo(() => {
    const off = new Set(mustInclude.atsOff.map((x) => x.toLowerCase()));
    return (track?.atsRoles ?? []).filter((r) => off.has(r.toLowerCase()));
  }, [track?.atsRoles, mustInclude.atsOff]);
  const saved = useFilters(categoryId);
  const [saveName, setSaveName] = useState('');
  const evidence = useMemo(() => parseEvidence(evidenceText), [evidenceText]);
  // A design-systems track ranks role types (design systems first) and folds the engineering-heavy
  // openings behind one quiet row, unless Calibrate's "Show engineering-heavy roles" is on.
  const roleTypes = useRoleTypes(categoryId, terms);
  // The wide sweep: one search across every title that is on. `onlyTitle` (a title chip) only
  // filters what is on screen (no re-fetch); the on/off list itself is per track and synced.
  const [sweeping, setSweeping] = useRemembered(kept('sweeping'), false);
  const [onlyTitle, setOnlyTitle] = useRemembered<string | null>(kept('onlyTitle'), null);
  const [zeroTitlesShown, setZeroTitlesShown] = useRemembered(kept('zeroTitles'), false);
  // The track's title filter (#223) is the sweep's list: what it searches, and what ranks and
  // filters every result.
  const titleFilter = useSweep(categoryId, sweepSeed);
  const sweepTitles = useMemo(() => activeTitles(titleFilter), [titleFilter]);
  const sweepKey = sweepTitles.join('\n');
  /** What the feed is reading: one term, or the sweep's titles. */
  const query = sweeping ? `sweep:${sweepKey}` : term;
  const queryReq = (): { term?: string; terms?: string[] } =>
    sweeping ? { terms: sweepKey ? sweepKey.split('\n') : [] } : { term };
  const hasQuery = sweeping ? sweepTitles.length > 0 : !!term.trim();

  // The track's own watched boards, every distinct one (deduped in fetchFeed; there is no cap).
  const boardsKey = boardUrls.join('\n');
  // Boards suggested for this kind of track (by its label), not yet watched. A click files them.
  const suggested = boardsForPack(packIdForLabel(track?.label ?? ''));
  const tiles = useTiles();
  const groups = useGroups();
  const suggestedCount = useMemo(
    () => countUnwatched(categoryId, suggested),
    // Recount whenever the track's tiles or groups change (watching, removing, archiving).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [categoryId, suggested, tiles, groups],
  );
  const watchedCount = useMemo(() => boardsFromUrls(boardUrls, Infinity).length, [boardUrls]);

  useEffect(() => {
    if (!hasQuery) return;
    // Come back to (return paths): this read already answered in full, so its rows stand as they
    // were, with no new read (Retry bumps `attempt` and reads again).
    if (
      loaded?.term === query &&
      loaded.boardsKey === boardsKey &&
      loaded.attempt === attempt &&
      !loaded.reading &&
      !loaded.error
    )
      return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();
    const term = query;
    fetchFeed({
      ...queryReq(),
      boardUrls: boardsKey ? boardsKey.split('\n') : [],
      // Show what has answered so far, repainting at most a few times a second.
      onProgress: (p) => {
        if (!alive || timer) return;
        timer = setTimeout(() => {
          timer = undefined;
          if (!alive) return;
          setLoaded({
            term,
            boardsKey,
            attempt,
            at: startedAt,
            result: { postings: p.postings, sources: p.sources },
            reading: { done: p.boardsDone, total: p.boardsTotal },
          });
        }, PROGRESS_REPAINT_MS);
      },
    })
      .then((result) => {
        clearTimeout(timer);
        timer = undefined;
        if (alive) setLoaded({ term, boardsKey, attempt, at: Date.now(), result });
      })
      .catch(() => {
        clearTimeout(timer);
        if (alive)
          setLoaded({
            term,
            boardsKey,
            attempt,
            at: Date.now(),
            error: 'The feed failed unexpectedly — try searching again.',
          });
      });
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // queryReq/hasQuery derive from `query`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, boardsKey, attempt]);

  const current = loaded && loaded.term === query && loaded.boardsKey === boardsKey ? loaded : null;
  const reading = current?.reading;

  const matched = useMemo<SweptPosting[]>(() => {
    if (!current?.result) return [];
    const o = { where, mode, now: current.at };
    // No term gate on a scored track: the term (or the sweep) picks what is read, the scorer what
    // is listed.
    if (scorer) return rankAll(current.result.postings, o).map((p) => ({ ...p, titles: [] }));
    return sweeping
      ? sweepRank(current.result.postings, sweepKey.split('\n'), o)
      : rankPostings(current.result.postings, { ...o, term }).map((p) => ({ ...p, titles: [] }));
  }, [current, term, where, mode, sweeping, sweepKey, scorer]);
  const floor = Number(floorText.replace(/[^\d.]/g, ''));
  const targeting = useMemo(
    () => ({
      ...NO_TARGETING,
      exclude: excludeText
        .split(/[,\n]/)
        .map((x) => x.trim())
        .filter(Boolean),
      seniority,
      salaryFloor: floor > 0 ? floor : undefined,
      salaryOnly,
      titles: { on: sweepTitles, off: titleFilter.off },
      include: mustInclude,
    }),
    [excludeText, seniority, floor, salaryOnly, sweepTitles, titleFilter.off, mustInclude],
  );
  const {
    postings: ranked,
    hidden,
    review,
  } = useMemo(() => applyTargeting(matched, targeting), [matched, targeting]);
  // Related titles (2026-10-23): what each would let in among the postings read, on or off.
  const showRelated = !scorer && hasRelatedTitles(mustInclude);
  const relatedOn = showRelated && mustInclude.related !== false;
  const perRelated = useMemo(
    () => (relatedOn ? relatedCounts(matched, mustInclude) : {}),
    [relatedOn, matched, mustInclude],
  );
  const hiddenNotes = [
    hidden.include > 0 &&
      (scorer
        ? `${hidden.include} left out by the scorer`
        : `${hidden.include} hidden by must include`),
    hidden.exclude > 0 && `${hidden.exclude} hidden by what you left out`,
    hidden.seniority > 0 && `${hidden.seniority} hidden by level`,
    hidden.salary > 0 && `${hidden.salary} hidden by pay`,
    hidden.titles > 0 && `${hidden.titles} hidden by titles`,
  ].filter((n): n is string => !!n);
  // Boards still being read with nothing to show yet reads as loading; once some rows exist they show.
  const loading = hasQuery && (!current || (!!reading && ranked.length === 0));
  const counts = useMemo(
    () => ({
      contract: ranked.filter((p) => p.signals.some((s) => s.id === 'contract')).length,
      founding: ranked.filter((p) => p.signals.some((s) => s.id === 'founding')).length,
    }),
    [ranked],
  );
  // Fit needs evidence: without it every posting would read as a Reach.
  const fits = useMemo(
    () =>
      evidence.length
        ? new Map(ranked.map((p) => [p.id, fitGap(p, evidence)] as const))
        : new Map<string, FitGap>(),
    [ranked, evidence],
  );
  const strongCount = ranked.filter((p) => fits.get(p.id)?.tier === 'strong').length;
  const patterns = useMemo(() => demandPatterns(ranked, evidence), [ranked, evidence]);
  const perTitle = useMemo(
    () => (sweeping ? titleCounts(ranked, sweepTitles) : {}),
    [sweeping, ranked, sweepTitles],
  );
  // With evidence the list leads with the best fits (stable: relevance breaks ties). On a
  // design-systems track the role type leads, fit and relevance order each type.
  const byFit = useMemo(() => {
    // A scored track keeps the scorer's order: best score, then newest.
    if (scorer) return ranked;
    const fitted = fits.size
      ? [...ranked].sort(
          (a, b) => TIER_RANK[fits.get(a.id)!.tier] - TIER_RANK[fits.get(b.id)!.tier],
        )
      : ranked;
    return roleTypes.ranked ? orderByRoleType(fitted) : fitted;
  }, [ranked, fits, roleTypes.ranked, scorer]);
  // A scored track folds nothing away and tags no role type: the scorer's reasons say what it is.
  const fold = roleTypes.fold && !scorer;
  const typed = roleTypes.ranked && !scorer;
  const foldedCount = useMemo(() => foldRoles(ranked, fold).folded.length, [ranked, fold]);
  // A scored track's rows carry no matched titles (the scorer lists them), so it has no title
  // chips to narrow by.
  const shownTitles =
    sweeping && onlyTitle && !scorer
      ? withoutHidden(byFit, new Set(sweepTitles.filter((t) => t !== onlyTitle)))
      : byFit;
  const focused =
    focus === 'all'
      ? shownTitles
      : focus === 'strong'
        ? shownTitles.filter((p) => fits.get(p.id)?.tier === 'strong')
        : shownTitles.filter((p) => p.signals.some((s) => s.id === focus));
  const { shown: visible, folded } = foldRoles(focused, fold);
  /** A title chip shows only that title's rows; the active one again (or All) shows every row. */
  const showOnly = (t: string | null) => {
    setOnlyTitle((cur) => (t === cur ? null : t));
    setShown(PAGE);
  };
  const startSweep = (on: boolean) => {
    setSweeping(on);
    if (on && sweepTitles.length === 0) setCalibrateOpen(true);
    setOnlyTitle(null);
    setZeroTitlesShown(false);
    setShown(PAGE);
  };
  // The slow note is for this read only: a new search or Retry starts the clock again.
  const loadKey = `${query}|${boardsKey}|${attempt}`;
  const [slowFor, setSlowFor] = useState('');
  const slow = loading && slowFor === loadKey;
  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => setSlowFor(loadKey), SLOW_MS);
    return () => clearTimeout(t);
  }, [loading, loadKey]);

  const jobs = useJobs();
  const savedKeys = useMemo(() => new Set(jobs.map((j) => dedupKey(j.url))), [jobs]);

  const saveSearch = () => {
    const name = saveName.trim();
    if (!name) return;
    saveFilter(categoryId, {
      name,
      term,
      where,
      mode,
      exclude: targeting.exclude,
      seniority,
      salaryFloor: targeting.salaryFloor,
      salaryOnly,
      contractOnly: focus === 'contract',
    });
    setSaveName('');
    toast({ title: `Saved “${name}”`, tone: 'success' });
  };
  const applySaved = (f: SavedFilter) => {
    setExcludeText(f.exclude.join(', '));
    setSeniority(f.seniority);
    setFloorText(f.salaryFloor ? String(f.salaryFloor) : '');
    setSalaryOnly(f.salaryOnly);
    setFocus(f.contractOnly ? 'contract' : 'all');
    setTrackContext(categoryId, { where: f.where, mode: f.mode });
    search(f.term);
  };

  const search = (t: string) => {
    setInput(t);
    setTerm(t.trim());
    setShown(PAGE);
  };
  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    search(input);
  };

  const onWatch = (e: FormEvent) => {
    e.preventDefault();
    const r = watchBoard(categoryId, watchUrl);
    if (!r.ok) {
      setWatchError(r.error);
      return;
    }
    setWatchUrl('');
    setWatchError('');
    toast({
      title: `Watching ${r.label}`,
      description: 'Its openings now show up here.',
      tone: 'success',
    });
  };

  // Saves one posting as a Job; the stored URL when it was new, else null.
  const saveOne = (p: SweptPosting): string | null => {
    const fields = jobFieldsFor(p, p.titles.length ? p.titles.join(', ') : term);
    const url = addJobDetailed(p.url, fields);
    if (!url) return null;
    // The fit rides along, so the Pipeline's Fit column and "Best fit" sort use it.
    const fg = fits.get(p.id);
    if (fg) updateJob(url, { verdict: TIER_INFO[fg.tier].verdict });
    return url;
  };
  const save = (p: SweptPosting) => {
    const url = saveOne(p);
    if (url) notifySaved([url], p.title);
  };
  // Wide net (rapid apply): save every unsaved posting on screen in one go (the Openings menu).
  const saveMany = (list: SweptPosting[]) =>
    notifySaved(list.map(saveOne).filter((u): u is string => !!u));

  const errors = current?.result?.sources.filter((s) => s.error) ?? [];
  const allFailed =
    !reading &&
    !!current?.result?.sources.length &&
    current.result.postings.length === 0 &&
    errors.length === current.result.sources.length;
  const status: AsyncStatus = loading
    ? 'loading'
    : current?.error || allFailed
      ? 'error'
      : !hasQuery || ranked.length === 0
        ? 'empty'
        : 'ready';

  // Evidence is the ask while nothing is showing: Refine opens by itself once, then the user
  // decides (it was the evidence box's own default before Refine held it inline, rev-3 J).
  const refineAutoOpened = useRef(false);
  useEffect(() => {
    if (refineAutoOpened.current || status !== 'empty' || !hasQuery || evidenceText) return;
    refineAutoOpened.current = true;
    setRefineOpen(true);
  }, [status, hasQuery, evidenceText]);

  // Retry the whole search: forget what is on screen and read every source again.
  const retryAll = () => {
    setLoaded(null);
    setAttempt((n) => n + 1);
  };
  // Retry only the named sources and fold their answers into what is showing.
  const retrySources = (keys: string[]) => {
    setRetrying((r) => [...r, ...keys]);
    const forTerm = query;
    const forBoards = boardsKey;
    fetchFeed({
      ...queryReq(),
      boardUrls: forBoards ? forBoards.split('\n') : [],
      only: keys,
    })
      .then((patch) =>
        setLoaded((prev) =>
          prev && prev.term === forTerm && prev.boardsKey === forBoards && prev.result
            ? { ...prev, result: mergeRetry(prev.result, patch) }
            : prev,
        ),
      )
      .catch(() => {})
      .finally(() => setRetrying((r) => r.filter((k) => !keys.includes(k))));
  };
  const emptyState = !hasQuery ? (
    <EmptyState
      centered
      icon={SearchX}
      title={sweeping ? 'No titles ticked' : 'Nothing to search yet'}
      description={
        sweeping
          ? 'Tick at least one title under Calibrate to sweep.'
          : 'Type a search term, or pick one under Calibrate.'
      }
    />
  ) : ranked.length === 0 && matched.length > 0 ? (
    <EmptyState
      centered
      icon={SearchX}
      title="Everything is hidden by your filters"
      description="Loosen what you left out, the level or the pay floor to see them again."
    />
  ) : (
    <EmptyState
      centered
      icon={SearchX}
      title={
        sweeping
          ? `No live openings mention any of your ${sweepTitles.length} titles right now`
          : `No live openings mention "${term}" right now`
      }
      description="Hacker News posts a fresh thread monthly and boards change daily. Try a broader term, or watch more company boards."
      action={
        <Button
          variant="secondary"
          size="sm"
          onClick={() => (sweeping ? startSweep(false) : searchRef.current?.focus())}
        >
          {sweeping ? 'Back to one search' : 'Try a broader term'}
        </Button>
      }
    />
  );

  const partial =
    errors.length > 0 && !allFailed ? (
      <PartialRow
        errors={errors}
        retrying={errors.some((e) => retrying.includes(e.key))}
        onRetry={() => retrySources(errors.filter((e) => !isBudgetSpent(e)).map((e) => e.key))}
      />
    ) : null;

  const focusOptions: { value: Focus; label: string; count: number }[] = [
    { value: 'all', label: 'All', count: ranked.length },
    ...(evidence.length
      ? [{ value: 'strong' as Focus, label: 'Strong fit', count: strongCount }]
      : []),
    { value: 'contract', label: 'Contract-friendly', count: counts.contract },
    { value: 'founding', label: 'First hire', count: counts.founding },
  ];
  // A filter with nothing in it is not offered; the one in use always is, so it can be left.
  const offered = focusOptions.filter((o) => o.value === 'all' || o.count > 0 || o.value === focus);
  const focusLabel = focusOptions.find((o) => o.value === focus)?.label ?? 'All';
  const unsaved = visible.filter((p) => !savedKeys.has(dedupKey(p.url)));
  // The browser's Back closes the open menu and stays on the page (return paths).
  const showSheet = useBackSheet('feed-show');
  const captionItems = [
    reading
      ? `Read ${reading.done} of ${reading.total} boards…`
      : scorer
        ? 'Sorted by score'
        : fits.size
          ? 'Sorted by fit'
          : 'Sorted by relevance',
    focus !== 'all' && `Showing ${focusLabel.toLowerCase()}`,
    ...hiddenNotes,
  ];

  const openingsMenu = (
    <Menu modal={false} {...showSheet}>
      <Menu.Trigger asChild>
        <Button
          size="sm"
          variant="secondary"
          iconOnly
          iconLeft={<Icon icon={Ellipsis} />}
          label="Openings options"
        />
      </Menu.Trigger>
      <Menu.Content align="end">
        <Menu.Label>Show</Menu.Label>
        <Menu.RadioGroup
          value={focus}
          onValueChange={(v) => {
            setFocus(v as Focus);
            setShown(PAGE);
          }}
        >
          {offered.map((o) => (
            <Menu.RadioItem key={o.value} value={o.value}>
              {`${o.label} (${o.count})`}
            </Menu.RadioItem>
          ))}
        </Menu.RadioGroup>
        <Menu.Separator />
        <Menu.Item disabled={unsaved.length === 0} onSelect={() => saveMany(unsaved)}>
          {`Save all (${unsaved.length})`}
        </Menu.Item>
      </Menu.Content>
    </Menu>
  );

  const readyPanel = (
    <OpeningsPanel
      count={ranked.length - foldedCount}
      caption={captionItems}
      trailing={
        <Stack direction="row" gap="px8" align="center">
          {!sweeping && (
            <Button size="sm" variant="secondary" onClick={() => startSweep(true)}>
              Find more
            </Button>
          )}
          {openingsMenu}
        </Stack>
      }
    >
      {partial}
      {visible.length === 0 && folded.length > 0 ? (
        <PanelRowBox>
          <Text variant="caption" as="p" tone="secondary">
            Only engineering-heavy roles match. They are below.
          </Text>
        </PanelRowBox>
      ) : visible.length === 0 ? (
        <PanelRowBox>
          <EmptyState
            title={
              shownTitles.length === 0
                ? 'No openings match this title. Pick All to see every title.'
                : focus === 'strong'
                  ? 'None is a strong fit for your evidence yet. Show all, or add evidence.'
                  : 'None of these openings carry that signal. Show all from the menu.'
            }
          />
        </PanelRowBox>
      ) : (
        <CardList label="Live postings" inset="sm">
          {visible.slice(0, shown).map((p) => (
            <PostingRow
              key={p.id}
              p={p}
              now={current!.at}
              saved={savedKeys.has(dedupKey(p.url))}
              fit={fits.get(p.id)}
              onSave={() => save(p)}
              sweepTitles={sweeping ? sweepTitles.length : 0}
              typeTag={typed ? roleTypeTag(roleTypeOf(p)) : ''}
            />
          ))}
        </CardList>
      )}
      {visible.length > shown && (
        <PanelRowBox>
          <Button variant="tertiary" size="sm" onClick={() => setShown((n) => n + PAGE)}>
            Show more ({visible.length - shown})
          </Button>
        </PanelRowBox>
      )}
      {folded.length > 0 && (
        <PanelRowBox>
          <Disclosure
            label={`${folded.length} engineering-heavy ${folded.length === 1 ? 'role' : 'roles'}`}
          >
            <CardList label="Engineering-heavy roles" inset="none">
              {folded.map((p) => (
                <PostingRow
                  key={p.id}
                  p={p}
                  now={current!.at}
                  saved={savedKeys.has(dedupKey(p.url))}
                  fit={fits.get(p.id)}
                  onSave={() => save(p)}
                  sweepTitles={sweeping ? sweepTitles.length : 0}
                  typeTag={roleTypeTag('design-engineering')}
                />
              ))}
            </CardList>
          </Disclosure>
        </PanelRowBox>
      )}
      {/* A scored track's review bucket: an adjacent title with too little body evidence, or
          body evidence with no title signal. Kept out of the list, one tap away, with reasons. */}
      {review.length > 0 && (
        <PanelRowBox>
          <Disclosure
            label={
              <Stack as="span" direction="row" gap="px8" align="center">
                Review
                <Badge count={review.length} />
              </Stack>
            }
          >
            <CardList label="Held for review" inset="none">
              {review.map((p) => (
                <PostingRow
                  key={p.id}
                  p={p}
                  now={current!.at}
                  saved={savedKeys.has(dedupKey(p.url))}
                  fit={fits.get(p.id)}
                  onSave={() => save(p)}
                  sweepTitles={0}
                />
              ))}
            </CardList>
          </Disclosure>
        </PanelRowBox>
      )}
    </OpeningsPanel>
  );

  const loadingPanel = (
    <OpeningsPanel
      busy
      caption={[
        reading ? `Read ${reading.done} of ${reading.total} boards…` : 'Pulling live openings…',
        slow && 'Still trying: slow sources are skipped after 15 s',
      ]}
    >
      <CardList inset="sm" hidden>
        {Array.from({ length: SKELETON_ROWS }, (_, i) => (
          <ListCard key={i}>
            <Stack gap="px8">
              <Skeleton variant="text" width="60%" />
              <Skeleton variant="text" width="30%" />
            </Stack>
          </ListCard>
        ))}
      </CardList>
    </OpeningsPanel>
  );

  // Empty with a query: the Openings panel still frames it (and any Partial row), so the page
  // keeps one shape; with no query there is nothing to frame.
  const emptyBlock = hasQuery ? (
    <OpeningsPanel count={0} caption={hiddenNotes}>
      {partial}
      <PanelRowBox>{emptyState}</PanelRowBox>
    </OpeningsPanel>
  ) : (
    emptyState
  );

  const sweepChips = sweeping && !scorer && sweepTitles.length > 1 && status === 'ready' && (
    <SweepChips
      titles={sweepTitles}
      counts={perTitle}
      total={ranked.length}
      only={onlyTitle}
      showZero={zeroTitlesShown}
      onShowZero={() => setZeroTitlesShown(true)}
      onPick={showOnly}
    />
  );

  return (
    // Panels stack 24 apart (rev-3): the search (or the sweep's head), Calibrate, Refine, Openings.
    <Stack gap="normal">
      {sweeping ? (
        <Stack gap="normal">
          <Stack gap="px8">
            <Text variant="title" as="h3">
              {`Sweeping ${sweepTitles.length} ${sweepTitles.length === 1 ? 'title' : 'titles'}`}
            </Text>
            <Text variant="caption" as="p" tone="secondary">
              Matched postings, deduped
            </Text>
            <Box>
              <Button size="md" variant="secondary" onClick={() => startSweep(false)}>
                Back to one search
              </Button>
            </Box>
          </Stack>
          {sweepChips}
        </Stack>
      ) : (
        <Box
          as="form"
          className="rjb-form-full"
          onSubmit={onSearch}
          sx={{ display: 'flex', gap: 'xs', alignItems: 'center' }}
        >
          <Box sx={{ flex: '1 1 0%', minWidth: 0, '& > *': { width: '100%' } }}>
            <HdsInput
              size="md"
              ref={searchRef}
              aria-label="Search term"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
          </Box>
          {/* Secondary: Live postings has no primary action (rev-3); the mock's only fill is a
              selected state. */}
          <Button type="submit" size="md" variant="secondary">
            Search
          </Button>
        </Box>
      )}
      {/* Calibrate (#223): the track's ticked titles beside the other targeting, then the saved
          searches. A row with what it holds under its name (rev-3 J), like Refine. */}
      <Card padding="none" className="rjb-disclosure-vertical">
        <Box sx={{ px: 'sm', pb: calibrateOpen ? 'sm' : 0 }}>
          <Disclosure
            variant="row"
            label={
              <Text variant="body" as="span" weight="bold">
                Calibrate
              </Text>
            }
            preview="Must include, titles, leave-out words, pay floor, level"
            open={calibrateOpen}
            onOpenChange={setCalibrateOpen}
          >
            <Stack gap="normal">
              <ChipEditor
                label="Must include (exact phrase)"
                placeholder="Add a phrase"
                values={mustInclude.terms}
                onChange={(next) => setMustInclude(categoryId, { terms: next })}
              />
              {/* Where must include looks (2026-10-23): title and description (off by default),
                  each on its own; both off reads as title only, and says so. A design system rule
                  reads titles only, so it has no toggles for the two. */}
              <Stack direction="row" wrap="wrap" gap="normal" align="center">
                {!showRelated && !scorer && (
                  <>
                    <Toggle
                      label="Match in title"
                      checked={mustInclude.inTitle !== false}
                      onChange={(on) => setMustInclude(categoryId, { inTitle: on })}
                    />
                    <Toggle
                      label="Match in description"
                      checked={mustInclude.inText === true}
                      onChange={(on) => setMustInclude(categoryId, { inText: on })}
                    />
                  </>
                )}
                {showRelated && (
                  <Toggle
                    label="Related titles"
                    checked={relatedOn}
                    onChange={(on) => setMustInclude(categoryId, { related: on })}
                  />
                )}
              </Stack>
              {showRelated && (
                <Text variant="caption" as="p" tone="secondary">
                  Matching job titles only: a title has to say design system or design systems.
                </Text>
              )}
              {scorer && (
                <Text variant="caption" as="p" tone="secondary">
                  {SCORED_TRACK_COPY}
                </Text>
              )}
              {/* Each related title as a toggle chip with what it lets in (or would) among the
                  postings read, on its title alone. */}
              {relatedOn && (
                <Stack gap="px8">
                  <Text variant="caption" as="p" tone="secondary">
                    Also list these titles
                  </Text>
                  <Stack direction="row" wrap="wrap" gap="px8" align="center">
                    {RELATED_TITLES.map(({ id }) => {
                      const on = relatedIsOn(mustInclude, id);
                      return (
                        <Tag
                          key={id}
                          active={on}
                          aria-pressed={on}
                          aria-label={`${id}, ${perRelated[id] ?? 0}`}
                          onClick={() => setMustInclude(categoryId, toggleRelated(mustInclude, id))}
                        >
                          <Stack as="span" direction="row" gap="px8" align="center">
                            {id}
                            <Badge count={perRelated[id] ?? 0} />
                          </Stack>
                        </Tag>
                      );
                    })}
                  </Stack>
                </Stack>
              )}
              {!showRelated &&
                !scorer &&
                mustInclude.inTitle === false &&
                mustInclude.inText !== true && (
                  <Text variant="caption" tone="secondary">
                    Both off: matching the title only.
                  </Text>
                )}
              <SweepTitlesEditor categoryId={categoryId} seed={sweepSeed} bare />
              {terms.length > 0 && (
                <Stack gap="px8">
                  <Text variant="ui" as="span">
                    Search for
                  </Text>
                  <Stack direction="row" wrap="wrap" gap="px8" align="center">
                    {terms.map((t) => (
                      <Tag
                        key={t}
                        active={!sweeping && t === term}
                        onClick={() => {
                          if (sweeping) startSweep(false);
                          search(t);
                        }}
                      >
                        {t}
                      </Tag>
                    ))}
                  </Stack>
                </Stack>
              )}
              {atsOff.length > 0 && (
                <Stack gap="px8">
                  <Text variant="ui" as="span">
                    Switched off
                  </Text>
                  <Stack direction="row" wrap="wrap" gap="px8" align="center">
                    {atsOff.map((r) => (
                      <Tag
                        key={r}
                        aria-label={`Search for ${r} again`}
                        onClick={() =>
                          setMustInclude(categoryId, {
                            atsOff: mustInclude.atsOff.filter(
                              (x) => x.toLowerCase() !== r.toLowerCase(),
                            ),
                          })
                        }
                      >
                        {r}
                      </Tag>
                    ))}
                  </Stack>
                </Stack>
              )}
              <Box
                sx={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  columnGap: 'xs',
                  rowGap: 'sm',
                  alignItems: 'flex-end',
                }}
              >
                <Box sx={{ flex: 1, minWidth: 200, maxWidth: 360, '& > *': { width: '100%' } }}>
                  <HdsInput
                    size="sm"
                    label="Leave out (words, commas between)"
                    placeholder="Leave out"
                    value={excludeText}
                    onChange={(e) => setExcludeText(e.target.value)}
                  />
                </Box>
                <Box sx={{ width: 160 }}>
                  <HdsInput
                    size="sm"
                    label="Pay floor (USD a year)"
                    inputMode="numeric"
                    placeholder="Pay floor"
                    value={floorText}
                    onChange={(e) => setFloorText(e.target.value)}
                  />
                </Box>
                <Box sx={{ overflowX: 'auto', maxWidth: '100%' }}>
                  <SegmentedControl
                    aria-label="Level"
                    size="sm"
                    value={seniority}
                    onChange={(v) => setSeniority(v as Seniority)}
                    options={[
                      { value: 'any', label: 'Any level' },
                      { value: 'entry', label: 'Entry level' },
                      { value: 'experienced', label: 'Experienced' },
                    ]}
                  />
                </Box>
                <HdsCheckbox
                  label="Only show postings with a salary"
                  checked={salaryOnly}
                  onChange={() => setSalaryOnly((v) => !v)}
                />
              </Box>
              {roleTypes.ranked && (
                <Toggle
                  label="Show engineering-heavy roles"
                  checked={!roleTypes.fold}
                  onChange={(on) => writeShowEngineering(categoryId, on)}
                />
              )}
              {/* Saved searches (rev-3): the last group, one UI 14/500 label over the name field
                  and its button on one row, then the saved ones as chips. */}
              <Stack gap="px8">
                <Text variant="ui" as="span" id={savedId}>
                  Saved searches
                </Text>
                {!sweeping && (
                  <Box
                    sx={{
                      display: 'flex',
                      gap: 'xs',
                      alignItems: 'center',
                      maxWidth: 'var(--semantic-layout-width-content)',
                    }}
                  >
                    <Box sx={{ flex: '1 1 0%', minWidth: 0, '& > *': { width: '100%' } }}>
                      <HdsInput
                        size="md"
                        aria-label="Name this search"
                        placeholder="Name this search"
                        value={saveName}
                        onChange={(e) => setSaveName(e.target.value)}
                      />
                    </Box>
                    <Button
                      size="md"
                      variant="secondary"
                      disabled={!saveName.trim()}
                      onClick={saveSearch}
                    >
                      Save search
                    </Button>
                  </Box>
                )}
                {saved.length > 0 ? (
                  <Stack
                    direction="row"
                    wrap="wrap"
                    gap="px8"
                    align="center"
                    role="group"
                    aria-labelledby={savedId}
                  >
                    {saved.map((f) => (
                      <Stack key={f.name} direction="row" gap="px4" align="center">
                        <Tag onClick={() => applySaved(f)}>{f.name}</Tag>
                        <Button
                          size="sm"
                          variant="tertiary"
                          iconOnly
                          iconLeft={<Icon icon={X} />}
                          label={`Remove saved search ${f.name}`}
                          onClick={() => deleteFilter(categoryId, f.name)}
                        />
                      </Stack>
                    ))}
                  </Stack>
                ) : (
                  <Text variant="caption" as="p" tone="secondary">
                    Name this search to keep its term, place and filters for later.
                  </Text>
                )}
              </Stack>
            </Stack>
          </Disclosure>
        </Box>
      </Card>

      {/* Watching companies and your evidence are set-and-forget: tucked away so the postings lead. */}
      <Card padding="none" className="rjb-disclosure-vertical">
        <Box sx={{ px: 'sm', pb: refineOpen ? 'sm' : 0 }}>
          <Disclosure
            variant="row"
            label={
              <Text variant="body" as="span" weight="bold">
                Refine
              </Text>
            }
            preview="Watch a company, your evidence"
            open={refineOpen}
            onOpenChange={setRefineOpen}
          >
            {/* One label style (UI 14/500) and one gap between label, field and helper. */}
            <Stack gap="normal">
              <Text variant="caption" as="p" tone="secondary">
                Openings come from Hacker News, Remotive, Jobicy and the company boards you watch.
                Nothing is kept until you save one.
              </Text>
              <Box as="form" className="rjb-form-full" onSubmit={onWatch}>
                <Stack gap="px8">
                  <Text variant="ui" as="span" id={watchId}>
                    Watch a company
                  </Text>
                  <Stack direction="row" gap="px8" align="center">
                    <Box sx={{ flex: '1 1 0%', minWidth: 0, '& > *': { width: '100%' } }}>
                      <HdsInput
                        aria-labelledby={watchId}
                        placeholder="Board link"
                        value={watchUrl}
                        onChange={(e) => setWatchUrl(e.target.value)}
                      />
                    </Box>
                    <Button type="submit" size="md" variant="secondary" disabled={!watchUrl.trim()}>
                      Watch
                    </Button>
                  </Stack>
                  <Text variant="caption" as="p" tone={watchError ? 'danger' : 'secondary'}>
                    {watchError ||
                      (watchedCount
                        ? `Watching ${watchedCount} company ${watchedCount === 1 ? 'board' : 'boards'}. Manage them in Manage track.`
                        : 'Paste a job-board link (Greenhouse, Lever, Ashby, Workable, Recruitee, SmartRecruiters, Teamtailor or Personio) to pull that company’s openings in.')}
                  </Text>
                </Stack>
              </Box>
              {suggestedCount > 0 && (
                <Box>
                  <Button
                    size="md"
                    variant="secondary"
                    onClick={() => {
                      const n = addBoardTiles(categoryId, suggested);
                      toast({
                        title: `Watching ${n} more ${n === 1 ? 'company' : 'companies'}`,
                        description: 'Their openings now show up here. Remove any in Manage track.',
                        tone: 'success',
                      });
                    }}
                  >
                    Add suggested companies ({suggestedCount})
                  </Button>
                </Box>
              )}
              <EvidenceEditor
                text={evidenceText}
                count={evidence.length}
                onChange={writeEvidence}
              />
            </Stack>
          </Disclosure>
        </Box>
      </Card>

      {status === 'ready' && evidence.length > 0 && <PatternsSummary patterns={patterns} />}

      {/* rjb-inline-alerts: the all-failed Alert's title reads at body size, not as a page head. */}
      <Box className="rjb-inline-alerts">
        <AsyncState
          status={loading ? 'ready' : status}
          label="Live openings"
          onRetry={retryAll}
          errorTitle={current?.error ?? "Couldn't reach any source"}
          error={current?.error ? undefined : 'Check your internet connection or try again later.'}
          empty={emptyBlock}
        >
          {loading ? loadingPanel : readyPanel}
        </AsyncState>
      </Box>
      {/* One line, once, instead of a fit badge missing from every row. */}
      {status === 'ready' && evidence.length === 0 && visible.length > 0 && (
        <Stack direction="row" wrap="wrap" gap="px8" align="center">
          <Text variant="caption" as="p" tone="secondary">
            Postings get a fit once you add evidence.
          </Text>
          <Button size="sm" variant="tertiary" onClick={() => setRefineOpen(true)}>
            Add evidence to see fit
          </Button>
        </Stack>
      )}
    </Stack>
  );
}

/** The Openings panel (rev-3 K): the Pipeline's Card (a raised fill, no outline), a header with the count, a caption
 *  of how it is sorted and what is hidden (two items a line, #192) and trailing controls, then
 *  rows split by hairlines. */
function OpeningsPanel({
  count,
  caption,
  trailing,
  busy = false,
  children,
}: {
  count?: number;
  caption: ReadonlyArray<string | false | null | undefined>;
  trailing?: ReactNode;
  busy?: boolean;
  children?: ReactNode;
}) {
  const lines = metaLines(caption);
  return (
    <Card as="section" aria-label="Openings" aria-busy={busy || undefined} padding="none">
      <Box sx={{ px: 'sm', py: 'sm' }}>
        <Stack direction="row" gap="px8" align="center" justify="space-between">
          <Box sx={{ minWidth: 0 }}>
            <Stack gap="px4">
              <Stack direction="row" gap="px8" align="center">
                <Text variant="body" as="h3" weight="bold">
                  Openings
                </Text>
                {count != null && <Badge count={count} label={`${count} openings`} />}
              </Stack>
              {lines.length > 0 && (
                <Box role="status">
                  {lines.map((l) => (
                    <Text key={l} variant="caption" as="p" tone="secondary">
                      {l}
                    </Text>
                  ))}
                </Box>
              )}
            </Stack>
          </Box>
          {trailing}
        </Stack>
      </Box>
      {children}
    </Card>
  );
}

/** One padded block of the Openings panel under its header (no hairline: the openings are
 *  cards, Adrian 2026-10-23). */
function PanelRowBox({ children }: { children: ReactNode }) {
  return <Box sx={{ px: 'sm', pb: 'sm' }}>{children}</Box>;
}

/** "Remotive and Jobicy", "A, B and C", "A, B +4 more". */
function namesOf(labels: string[]): string {
  if (labels.length > 3) return `${labels.slice(0, 2).join(', ')} +${labels.length - 2} more`;
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

/** Remotive's per-browser daily budget is spent (fetchFeed's describeError wording). */
function isBudgetSpent(e: { error?: string }): boolean {
  return !!e.error?.includes('daily limit reached');
}

/** The first row of Openings when some sources failed (rev-3 mock "Partial"): one line of what
 *  failed and one Retry for all of them. A single failure says why, in the source's own words. */
function PartialRow({
  errors,
  retrying,
  onRetry,
}: {
  errors: { key: string; label: string; error?: string }[];
  retrying: boolean;
  onRetry: () => void;
}) {
  // A sweep reads a source once per title ("Remotive · “Designer”"): count and name each once.
  const sourceOf = (e: { label: string }) => e.label.split(' · ')[0];
  const names = [...new Set(errors.map(sourceOf))];
  const n = names.length;
  // Remotive's daily budget is spent: a Retry cannot succeed, so it gets its own words and none.
  const spent = [...new Set(errors.filter(isBudgetSpent).map(sourceOf))];
  const canRetry = errors.some((e) => !isBudgetSpent(e));
  // Only a spent daily limit is not a failure: one quiet line, no warning, no Retry.
  if (spent.length === n)
    return (
      <PanelRowBox>
        <Text variant="caption" as="p" tone="secondary">
          {`${namesOf(spent)}: today's free searches are used up. Showing the rest; more tomorrow.`}
        </Text>
      </PanelRowBox>
    );
  const detail =
    n === 1 && errors.length === 1 && errors[0].error ? errors[0].error : `${namesOf(names)}.`;
  return (
    <PanelRowBox>
      <Stack direction="row" gap="tight" align="center" justify="space-between">
        <Box sx={{ minWidth: 0, flex: '1 1 0%' }}>
          <Stack gap="px4" align="start">
            <Badge tone="warning">Partial</Badge>
            <Text variant="body" as="p" weight="bold">
              {`${n} ${n === 1 ? 'source' : 'sources'} didn’t answer`}
            </Text>
            <Text variant="caption" as="p" tone="secondary">
              {`${detail} Results below are from the rest.`}
            </Text>
          </Stack>
        </Box>
        {canRetry && (
          <Button size="sm" variant="secondary" disabled={retrying} onClick={onRetry}>
            {retrying ? 'Retrying…' : 'Retry'}
          </Button>
        )}
      </Stack>
    </PanelRowBox>
  );
}

/** The sweep's title filter (rev-3 mock): All with the total first, then one chip per title with
 *  its count. One chip is selected at a time, and only the selected one is filled (rev-3 D).
 *  Titles with no match wait behind "+N more". */
function SweepChips({
  titles,
  counts,
  total,
  only,
  showZero,
  onShowZero,
  onPick,
}: {
  titles: string[];
  counts: Record<string, number>;
  total: number;
  only: string | null;
  showZero: boolean;
  onShowZero: () => void;
  onPick: (t: string | null) => void;
}) {
  const zero = titles.filter((t) => !counts[t] && t !== only);
  const shown = showZero ? titles : titles.filter((t) => !zero.includes(t));
  return (
    <Stack
      direction="row"
      wrap="wrap"
      gap="px8"
      align="center"
      role="group"
      aria-label="Show titles"
    >
      <Tag active={only === null} aria-label={`All, ${total}`} onClick={() => onPick(null)}>
        <Stack as="span" direction="row" gap="px8" align="center">
          All
          <Badge count={total} />
        </Stack>
      </Tag>
      {shown.map((t) => (
        <Tag
          key={t}
          active={only === t}
          aria-label={`${t}, ${counts[t] ?? 0}`}
          onClick={() => onPick(t)}
        >
          <Stack as="span" direction="row" gap="px8" align="center">
            {t}
            <Badge count={counts[t] ?? 0} />
          </Stack>
        </Tag>
      ))}
      {!showZero && zero.length > 0 && (
        <Tag onClick={onShowZero} aria-label={`Show ${zero.length} more titles with no openings`}>
          {`+${zero.length} more`}
        </Tag>
      )}
    </Stack>
  );
}

/** "$95k to $120k" from a source's stated yearly pay; '' when it states none. */
function payLabel(p: SweptPosting): string {
  const k = (n: number) => `$${Math.round(n / 1000)}k`;
  if (p.salaryMin && p.salaryMax && p.salaryMin !== p.salaryMax)
    return `${k(p.salaryMin)} to ${k(p.salaryMax)}`;
  const one = p.salaryMax ?? p.salaryMin;
  return one ? k(one) : '';
}

/** A signal as a fact: a short word with an icon, its evidence in a tooltip. */
const SIGNAL_FACT: Record<SignalId, { icon: LucideIcon; text: string }> = {
  contract: { icon: FileSignature, text: 'Contract' },
  founding: { icon: Rocket, text: 'First hire' },
};

function Fact({ icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <Stack direction="row" gap="px4" align="center">
      <Icon icon={icon} size="small" />
      <Text variant="caption" as="span" tone="secondary">
        {text}
      </Text>
    </Stack>
  );
}

function SignalFact({ sig }: { sig: Signal }) {
  const f = SIGNAL_FACT[sig.id];
  return (
    <HdsTooltip>
      <HdsTooltip.Trigger asChild>
        <span tabIndex={0} aria-label={`${f.text}: says “${sig.evidence}”`}>
          <Fact icon={f.icon} text={f.text} />
        </span>
      </HdsTooltip.Trigger>
      <HdsTooltip.Content>Says “{sig.evidence}”</HdsTooltip.Content>
    </HdsTooltip>
  );
}

/** One opening (rev-3 K, H anatomy): the fit badge then the source as a small label on top, the
 *  title on its own line, the company (the "who") in UI 14/500, then the facts with icons (place,
 *  pay, posted, and the contract / first-hire signals); Save sits on the right, centred on the
 *  row. A swept row names one other title it matched as a chip, only when the sweep covers
 *  several titles. With a fit, the fit badge is a button that says why (Fit and gap). */
function PostingRow({
  p,
  now,
  saved,
  fit,
  onSave,
  sweepTitles,
  typeTag = '',
}: {
  p: SweptPosting;
  now: number;
  saved: boolean;
  /** Present once the user has evidence. */
  fit?: FitGap;
  onSave: () => void;
  /** How many titles the sweep covers (0 outside a sweep). */
  sweepTitles: number;
  /** The role type in plain words on a design-systems track ("Design systems"); '' for none. */
  typeTag?: string;
}) {
  const [why, setWhy] = useState(false);
  useBackCloses(why, () => setWhy(false), `feed-why:${p.id}`);
  // Save here: the Saved status arrives and its check pops (not for one saved before).
  const justSaved = useArrived(saved, p.id);
  const place = p.location || (p.mode ? modeLabel(p.mode) : '');
  const posted = postedAgo(p.postedAt, now);
  const pay = payLabel(p);
  const facts = [
    place && { icon: MapPin, text: place },
    pay && { icon: Banknote, text: pay },
    posted && { icon: Calendar, text: posted === 'today' ? 'Posted today' : `Posted ${posted}` },
  ].filter((f): f is { icon: LucideIcon; text: string } => !!f);
  const matched =
    sweepTitles > 1 ? p.titles.filter((t) => t.toLowerCase() !== p.title.trim().toLowerCase()) : [];
  return (
    <ListCard>
      <Stack direction="row" gap="tight" align="center" justify="space-between">
        <Box sx={{ minWidth: 0, flex: '1 1 0%', overflowWrap: 'anywhere' }}>
          <Stack gap="px4">
            <Stack direction="row" wrap="wrap" gap="px8" align="center">
              {fit && (
                // The fit is the way into Fit and gap: no per-row menu beside Save (rev-3 K). A
                // bordered small button with a chevron, so it reads as tappable, sized on its own
                // line (40px on a phone) so its hit area never overhangs the title below.
                <Button
                  size="sm"
                  variant="secondary"
                  iconRight={<Icon icon={ChevronRight} />}
                  aria-label={`Why ${verdictLabel(TIER_INFO[fit.tier].verdict)}`}
                  aria-haspopup="dialog"
                  onClick={() => setWhy(true)}
                >
                  {verdictLabel(TIER_INFO[fit.tier].verdict)}
                </Button>
              )}
              {typeTag && <Badge tone="neutral">{typeTag}</Badge>}
              <Text variant="caption" as="span" tone="secondary">
                {SOURCE_LABEL[p.source]}
              </Text>
            </Stack>
            {/* An opening has no page in the app: its title is the posting link, with the
                external-link icon so it reads as leaving the app (Adrian 2026-10-22). */}
            <Text variant="body" as="h3" weight="bold" className="rjb-card-title">
              <InlineLink href={p.url}>{p.title}</InlineLink>
            </Text>
            {p.company && (
              <Text variant="ui" as="p">
                {p.company}
              </Text>
            )}
            {p.trackScore && (
              <Text variant="caption" as="p" tone="secondary">
                {reasonsLine(p.trackScore)}
              </Text>
            )}
            {(facts.length > 0 || p.signals.length > 0) && (
              <Stack direction="row" wrap="wrap" gap="tight" align="center">
                {facts.map((f) => (
                  <Fact key={f.text} icon={f.icon} text={f.text} />
                ))}
                {p.signals.map((sig) => (
                  <SignalFact key={sig.id} sig={sig} />
                ))}
              </Stack>
            )}
            {matched.length > 0 && (
              <Box sx={{ display: 'flex', gap: 'px4', alignItems: 'center', minWidth: 0 }}>
                <VisuallyHidden>Matched</VisuallyHidden>
                <span className="rjb-chip rjb-chip-icon rjb-chip-shrink">
                  <Icon icon={Search} size="small" />
                  <span className="rjb-chip-text">{matched[0]}</span>
                </span>
                {matched.length > 1 && (
                  <Box as="span" sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
                    <Text variant="caption" as="span" tone="secondary">
                      {`+${matched.length - 1}`}
                    </Text>
                  </Box>
                )}
              </Box>
            )}
          </Stack>
        </Box>
        {saved ? (
          // A status in Save's slot, not a disabled control (disabled text fails 3:1 here).
          <Box
            className={justSaved ? 'rjb-arrive' : undefined}
            sx={{ display: 'flex', alignItems: 'center', gap: 'px4', minHeight: 36, flexShrink: 0 }}
          >
            <Icon icon={Check} size="small" className={justSaved ? 'rjb-pop' : undefined} />
            <Text variant="ui" as="span">
              Saved
            </Text>
          </Box>
        ) : (
          <Button size="sm" variant="secondary" onClick={onSave}>
            Save
          </Button>
        )}
      </Stack>
      {fit && (
        <Dialog open={why} onOpenChange={setWhy}>
          {why && (
            <Dialog.Content>
              <Dialog.Header>
                <Dialog.Title>{`${verdictLabel(TIER_INFO[fit.tier].verdict)}: ${p.title}`}</Dialog.Title>
                <Dialog.Description>
                  What this posting asks for that your evidence covers, and what it doesn’t.
                </Dialog.Description>
              </Dialog.Header>
              <FitGapBody fg={fit} />
            </Dialog.Content>
          )}
        </Dialog>
      )}
    </ListCard>
  );
}
