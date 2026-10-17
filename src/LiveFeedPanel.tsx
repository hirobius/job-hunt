// Discover → "Live postings": real openings pulled at view time from public, keyless APIs — Hacker
// News "Who is hiring?", Remotive, the Greenhouse/Lever/Ashby boards this track watches and a starter
// directory of company boards — then phrase-matched and ranked by src/feed/match.ts. With the user's
// evidence, each posting also gets a fit (Role Radar's engine, src/radar/). Nothing is stored until
// the user saves a posting, which turns it into a tracked Job. Watching a board files a tile on the
// track (src/feed/watchlist.ts).
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  Alert,
  Badge,
  Button,
  Tooltip as HdsTooltip,
  Input as HdsInput,
  SegmentedControl,
  Checkbox as HdsCheckbox,
  Disclosure,
  Spinner,
  Stack,
  Tag,
  useToast,
  Box,
  Icon,
  Text,
  InlineLink,
} from '@hirobius/design-system';
import { X } from 'lucide-react';
import EmptyState from './EmptyState';
import { EvidenceEditor, FitGapDetails, PatternsSummary } from './FeedFit';
import { setTrackContext, useTrackContext } from './discoverContext';
import { ContextCaption } from './LocationControl';
import { addJobDetailed, dedupKey, updateJob, useJobs } from './store';
import { notifySaved } from './saveNotice';
import { fetchFeed, type FeedResult } from './feed/fetchFeed';
import { mergeRetry } from './feed/mergeFeed';
import AsyncState, { type AsyncStatus } from './hds-gaps/AsyncState';
import { rankPostings } from './feed/match';
import { applyTargeting, NO_TARGETING } from './feed/targeting';
import type { Seniority } from './curation/types';
import { useCategories, useGroups, useTiles } from './curation/curationStore';
import { postedAgo } from './feed/format';
import { boardsFromUrls, canonicalBoardUrl, type Board } from './feed/sources/ats';
import { groupByCompany, type CompanyGroup } from './feed/byCompany';
import { DreamStar } from './TeamRoles';
import { useHashView } from './hashView';
import { SavedTargets } from './OutreachRows';
import { deleteFilter, saveFilter, useFilters, type SavedFilter } from './feed/savedFilters';
import { addBoardTiles, countUnwatched, watchBoard } from './feed/watchlist';
import { boardsForPack, packIdForLabel } from './curation/starterPacks';
import { jobFieldsFor } from './feed/toJob';
import { modeLabel, verdictLabel, verdictTone } from './screening';
import { fitGap, parseEvidence, type FitGap } from './radar/fitGap';
import { demandPatterns } from './radar/patterns';
import { TIER_INFO, useEvidence, writeEvidence } from './radar/evidenceStore';
import { SOURCE_LABEL, type RankedPosting, type SignalId } from './feed/types';
import { SECONDARY } from './hds-gaps/tone';

type Focus = 'all' | 'strong' | SignalId;
/** Rows rendered per page — the rest sit behind "Show more". */
const PAGE = 40;

interface Loaded {
  term: string;
  boardsKey: string;
  at: number;
  result?: FeedResult;
  error?: string;
  /** Still reading boards: `result` is what has answered so far. */
  reading?: { done: number; total: number };
}

/** How often a long board read repaints the list. */
const PROGRESS_REPAINT_MS = 250;

export default function LiveFeedPanel({
  categoryId,
  terms,
  boardUrls,
}: {
  categoryId: string;
  /** The track's search terms — offered as chips; the first is searched on open. */
  terms: string[];
  /** Every tile URL on the track; the feed pulls the ones that are company boards. */
  boardUrls: string[];
}) {
  const { where, mode } = useTrackContext(categoryId);
  const { toast } = useToast();
  const [input, setInput] = useState(terms[0] ?? '');
  const [term, setTerm] = useState(terms[0] ?? '');
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  /** Bumped by Retry so the same term and boards are read again. */
  const [attempt, setAttempt] = useState(0);
  /** Source keys a per-source Retry is reading right now. */
  const [retrying, setRetrying] = useState<string[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);
  const [refineOpen, setRefineOpen] = useState(false);
  const [focus, setFocus] = useState<Focus>('all');
  const [shown, setShown] = useState(PAGE);
  const [watchUrl, setWatchUrl] = useState('');
  const [watchError, setWatchError] = useState('');
  const evidenceText = useEvidence();
  const track = useCategories().find((c) => c.id === categoryId);
  const trackSeniority = track?.seniority ?? 'any';
  const [excludeText, setExcludeText] = useState('');
  const [seniority, setSeniority] = useState<Seniority>(trackSeniority);
  const [floorText, setFloorText] = useState('');
  const [salaryOnly, setSalaryOnly] = useState(false);
  const saved = useFilters(categoryId);
  const [saveName, setSaveName] = useState('');
  const evidence = useMemo(() => parseEvidence(evidenceText), [evidenceText]);

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
  const [view, setView] = useHashView();
  const byCompany = view === 'companies';
  const watchedBoards = useMemo(() => boardsFromUrls(boardUrls, Infinity), [boardUrls]);
  const watchedCount = useMemo(() => boardsFromUrls(boardUrls, Infinity).length, [boardUrls]);

  useEffect(() => {
    if (!term.trim()) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();
    fetchFeed({
      term,
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
        if (alive) setLoaded({ term, boardsKey, at: Date.now(), result });
      })
      .catch(() => {
        clearTimeout(timer);
        if (alive)
          setLoaded({
            term,
            boardsKey,
            at: Date.now(),
            error: 'The feed failed unexpectedly — try searching again.',
          });
      });
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [term, boardsKey, attempt]);

  const current = loaded && loaded.term === term && loaded.boardsKey === boardsKey ? loaded : null;
  const reading = current?.reading;

  const matched = useMemo(
    () =>
      current?.result
        ? rankPostings(current.result.postings, { term, where, mode, now: current.at })
        : [],
    [current, term, where, mode],
  );
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
    }),
    [excludeText, seniority, floor, salaryOnly],
  );
  const { postings: ranked, hidden } = useMemo(
    () => applyTargeting(matched, targeting),
    [matched, targeting],
  );
  const hiddenNotes = [
    hidden.exclude > 0 && `${hidden.exclude} hidden by what you left out`,
    hidden.seniority > 0 && `${hidden.seniority} hidden by level`,
    hidden.salary > 0 && `${hidden.salary} hidden by pay`,
  ].filter(Boolean);
  // Boards still being read with nothing to show yet reads as loading; once some rows exist they show.
  const loading = !!term.trim() && (!current || (!!reading && ranked.length === 0));
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
  const visible =
    focus === 'all'
      ? ranked
      : focus === 'strong'
        ? ranked.filter((p) => fits.get(p.id)?.tier === 'strong')
        : ranked.filter((p) => p.signals.some((s) => s.id === focus));

  const companies = useMemo(() => (byCompany ? groupByCompany(visible) : []), [byCompany, visible]);
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

  const watchCompany = (board: Board) => {
    const r = watchBoard(categoryId, canonicalBoardUrl(board));
    if (r.ok)
      toast({
        title: `Watching ${r.label}`,
        description: 'Its openings now show up here.',
        tone: 'success',
      });
    else toast({ title: r.error, tone: 'warning' });
  };

  // Saves one posting as a Job; the stored URL when it was new, else null.
  const saveOne = (p: RankedPosting): string | null => {
    const fields = jobFieldsFor(p, term);
    const url = addJobDetailed(p.url, fields);
    if (!url) return null;
    // The fit rides along, so the Pipeline's Fit column and "Best fit" sort use it.
    const fg = fits.get(p.id);
    if (fg) updateJob(url, { verdict: TIER_INFO[fg.tier].verdict });
    return url;
  };
  const save = (p: RankedPosting) => {
    const url = saveOne(p);
    if (url) notifySaved([url], p.title);
  };
  // Wide net (rapid apply): save every picked posting, or every one on screen, in one go.
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const saveMany = (list: RankedPosting[]) => {
    notifySaved(list.map(saveOne).filter((u): u is string => !!u));
    setPicked(new Set());
  };
  const togglePick = (id: string) =>
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

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
      : !term.trim() || ranked.length === 0
        ? 'empty'
        : 'ready';

  // Retry the whole search: forget what is on screen and read every source again.
  const retryAll = () => {
    setLoaded(null);
    setAttempt((n) => n + 1);
  };
  // Retry only the named sources and fold their answers into what is showing.
  const retrySources = (keys: string[]) => {
    setRetrying((r) => [...r, ...keys]);
    const forTerm = term;
    const forBoards = boardsKey;
    fetchFeed({
      term: forTerm,
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
  const failedRow = (s: { key: string; label: string; error?: string }) => (
    <Stack key={s.key} direction="row" gap="xs" align="center" wrap="wrap">
      <Box>{s.error}</Box>
      <Button
        size="sm"
        variant="tertiary"
        disabled={retrying.includes(s.key)}
        aria-label={`Retry ${s.label}`}
        onClick={() => retrySources([s.key])}
      >
        {retrying.includes(s.key) ? 'Retrying…' : 'Retry'}
      </Button>
    </Stack>
  );
  const emptyState = !term.trim() ? (
    <EmptyState message="Type a search term or pick one of this track's terms." />
  ) : ranked.length === 0 && matched.length > 0 ? (
    <EmptyState
      title="Everything is hidden by your filters"
      message="Loosen what you left out, the level or the pay floor to see them again."
    />
  ) : (
    <EmptyState
      title={`No live openings mention “${term}” right now`}
      message="Hacker News posts a fresh thread monthly and boards change daily — try a broader term, or watch more company boards."
      action={
        <Button variant="secondary" size="sm" onClick={() => searchRef.current?.focus()}>
          Try a broader term
        </Button>
      }
    />
  );

  return (
    <Box>
      <Text
        variant="ui"
        style={{
          color: 'var(--semantic-color-content-secondary)',
          marginBottom: 'calc(var(--primitive-space-1) * 2.5)',
        }}
      >
        Real openings from Hacker News (“Who is hiring” and the freelancer thread), Remotive,
        Jobicy, Remote OK and the company boards you watch, ranked by relevance. Add your evidence
        and each one gets a fit. Nothing is kept until you save one.
      </Text>
      <ContextCaption categoryId={categoryId} />
      <Box
        as="form"
        onSubmit={onSearch}
        sx={{ display: 'flex', gap: 'xs', alignItems: 'flex-end', mb: 'xs' }}
      >
        <Box sx={{ flex: 1, maxWidth: 360, '& > *': { width: '100%' } }}>
          <HdsInput
            size="sm"
            ref={searchRef}
            label="Search term"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            style={{ width: '100%' }}
          />
        </Box>
        <Button type="submit" size="sm" variant="primary">
          Search
        </Button>
      </Box>
      {terms.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: 3 }}>
          {terms.map((t) => (
            <Tag key={t} onClick={() => search(t)}>
              {t}
            </Tag>
          ))}
        </Box>
      )}

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 'xs', alignItems: 'flex-end', mb: 'xs' }}>
        <Box sx={{ flex: 1, minWidth: 200, maxWidth: 360, '& > *': { width: '100%' } }}>
          <HdsInput
            size="sm"
            label="Leave out (words, commas between)"
            placeholder="manager, sales"
            value={excludeText}
            onChange={(e) => setExcludeText(e.target.value)}
            style={{ width: '100%' }}
          />
        </Box>
        <Box sx={{ width: 160 }}>
          <HdsInput
            size="sm"
            label="Pay floor (USD a year)"
            inputMode="numeric"
            placeholder="120000"
            value={floorText}
            onChange={(e) => setFloorText(e.target.value)}
            style={{ width: '100%' }}
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
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 'xs', alignItems: 'flex-end', mb: 'xs' }}>
        <Box sx={{ width: 200 }}>
          <HdsInput
            size="sm"
            label="Name this search"
            placeholder="Austin contract"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            style={{ width: '100%' }}
          />
        </Box>
        <Button size="sm" variant="secondary" disabled={!saveName.trim()} onClick={saveSearch}>
          Save search
        </Button>
      </Box>
      {saved.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'center', mb: 'xs' }}>
          {saved.map((f) => (
            <Box key={f.name} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Tag onClick={() => applySaved(f)}>{f.name}</Tag>
              <Button
                size="sm"
                variant="tertiary"
                iconOnly
                iconLeft={<Icon icon={X} />}
                label={`Remove saved search ${f.name}`}
                onClick={() => deleteFilter(categoryId, f.name)}
              />
            </Box>
          ))}
        </Box>
      )}
      {hiddenNotes.length > 0 && (
        <Text
          variant="caption"
          as="span"
          role="status"
          style={{
            color: 'var(--semantic-color-content-secondary)',
            display: 'block',
            marginBottom: 'var(--semantic-space-scale-xs)',
          }}
        >
          {hiddenNotes.join(' · ')}
        </Text>
      )}

      {/* Watching companies and your evidence are set-and-forget: tucked away so the postings lead. */}
      <Box sx={{ mb: 'sm' }}>
        <Disclosure label="Refine" open={refineOpen} onOpenChange={setRefineOpen}>
          <Stack gap="xs">
            <Box
              as="form"
              onSubmit={onWatch}
              sx={{ display: 'flex', gap: 'xs', alignItems: 'flex-end', mb: 1 }}
            >
              <Box sx={{ flex: 1, maxWidth: 360, '& > *': { width: '100%' } }}>
                <HdsInput
                  size="sm"
                  label="Watch a company"
                  placeholder="jobs.ashbyhq.com/company"
                  value={watchUrl}
                  onChange={(e) => setWatchUrl(e.target.value)}
                  style={{ width: '100%' }}
                />
              </Box>
              <Button type="submit" size="sm" variant="secondary" disabled={!watchUrl.trim()}>
                Watch
              </Button>
            </Box>
            <Text
              variant="caption"
              as="span"
              style={{
                color: watchError
                  ? 'var(--semantic-color-feedback-error)'
                  : 'var(--semantic-color-content-secondary)',
                display: 'block',
                marginBottom: 'var(--semantic-space-scale-sm)',
              }}
            >
              {watchError ||
                (watchedCount
                  ? `Watching ${watchedCount} company ${watchedCount === 1 ? 'board' : 'boards'} — manage them in this track's “Watched companies” tab.`
                  : 'Paste a Greenhouse, Lever, Ashby, Workable or Recruitee job-board link to pull that company’s openings in.')}
            </Text>

            {suggestedCount > 0 && (
              <Box sx={{ mb: 'xs' }}>
                <Button
                  size="sm"
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

            <Box>
              <EvidenceEditor
                startOpen={ranked.length === 0}
                text={evidenceText}
                count={evidence.length}
                onChange={writeEvidence}
              />
            </Box>
          </Stack>
        </Disclosure>
      </Box>

      {errors.length > 0 && !allFailed && (
        <Box sx={{ mb: 3 }}>
          <Alert
            tone="warning"
            title={
              errors.length > 2
                ? `${errors.length} sources didn’t respond`
                : 'Some sources didn’t respond'
            }
          >
            {/* Many boards can fail at once (a blocker, an outage): keep the list behind a disclosure. */}
            {errors.length > 2 ? (
              <Disclosure label="Show which ones">{errors.map(failedRow)}</Disclosure>
            ) : (
              errors.map(failedRow)
            )}
          </Alert>
        </Box>
      )}
      {reading && !loading && (
        <Stack
          direction="row"
          gap="xs"
          align="center"
          style={{ marginBottom: 'var(--semantic-space-scale-xs)' }}
        >
          <Spinner size="sm" label="Reading company boards" />
          <Text variant="caption" as="span" role="status" style={SECONDARY}>
            Read {reading.done} of {reading.total} boards. More openings may appear.
          </Text>
        </Stack>
      )}

      <AsyncState
        status={status}
        onRetry={retryAll}
        loadingLabel={
          reading
            ? `Read ${reading.done} of ${reading.total} boards, nothing matching yet…`
            : `Pulling live openings for “${term}”…`
        }
        slowNote="Still trying: slow sources are skipped after 15 s"
        error={
          current?.error
            ? { title: current.error }
            : {
                title: "Couldn't reach any source",
                message: 'Check your internet connection or try again later.',
              }
        }
        empty={emptyState}
      >
        <Box>
          <Box sx={{ mb: 'xs' }}>
            <PatternsSummary patterns={patterns} />
          </Box>
          <Box sx={{ mb: 'xs' }}>
            <SegmentedControl
              aria-label="View"
              size="sm"
              value={byCompany ? 'companies' : 'openings'}
              onChange={(v) => {
                setView(v === 'companies' ? 'companies' : null);
                setShown(PAGE);
              }}
              options={[
                { value: 'openings', label: 'Openings' },
                { value: 'companies', label: 'Companies' },
              ]}
            />
          </Box>
          {/* Scrolls sideways on narrow screens rather than clipping (same as the tab bar). */}
          <Box sx={{ mb: 'xs', overflowX: 'auto', maxWidth: '100%', pb: 0.5 }}>
            <SegmentedControl
              aria-label="Show"
              size="sm"
              value={focus}
              onChange={(v) => {
                setFocus(v as Focus);
                setShown(PAGE);
              }}
              options={[
                { value: 'all', label: `All (${ranked.length})` },
                ...(evidence.length
                  ? [{ value: 'strong', label: `Strong fit (${strongCount})` }]
                  : []),
                { value: 'contract', label: `Contract-friendly (${counts.contract})` },
                { value: 'founding', label: `First hire (${counts.founding})` },
              ]}
            />
          </Box>
          {visible.length > 0 && (
            <BulkSaveBar
              picked={visible.filter((p) => picked.has(p.id) && !savedKeys.has(dedupKey(p.url)))}
              shown={visible.slice(0, shown).filter((p) => !savedKeys.has(dedupKey(p.url)))}
              onSave={saveMany}
            />
          )}
          {visible.length === 0 ? (
            <EmptyState
              message={
                focus === 'strong'
                  ? 'None is a strong fit for your evidence yet — switch back to All, or add evidence.'
                  : 'None of these openings carry that signal — switch back to All.'
              }
            />
          ) : byCompany ? (
            <Box as="ul" sx={{ listStyle: 'none', m: 0, p: 0 }} aria-label="Companies">
              {companies.slice(0, shown).map((g) => (
                <CompanyRow
                  key={g.key}
                  g={g}
                  categoryId={categoryId}
                  now={current!.at}
                  unwatched={g.boards.find(
                    (b) =>
                      !watchedBoards.some(
                        (w) => w.kind === b.kind && w.slug.toLowerCase() === b.slug.toLowerCase(),
                      ),
                  )}
                  onWatch={watchCompany}
                />
              ))}
            </Box>
          ) : (
            <Box as="ul" sx={{ listStyle: 'none', m: 0, p: 0 }} aria-label="Live postings">
              {visible.slice(0, shown).map((p) => (
                <PostingRow
                  key={p.id}
                  p={p}
                  now={current!.at}
                  saved={savedKeys.has(dedupKey(p.url))}
                  fit={fits.get(p.id)}
                  onSave={() => save(p)}
                  picked={picked.has(p.id)}
                  onPick={() => togglePick(p.id)}
                />
              ))}
            </Box>
          )}
          {byCompany && (
            <Box sx={{ mt: 'md' }}>
              <SavedTargets categoryId={categoryId} boardUrls={boardUrls} />
            </Box>
          )}
          {/* One line, once, instead of a fit badge missing from every row. */}
          {!byCompany && evidence.length === 0 && visible.length > 0 && (
            <Box sx={{ mt: 'xs' }}>
              <Text variant="caption" as="span" style={SECONDARY}>
                Postings get a fit once you add evidence.{' '}
              </Text>
              <Button size="sm" variant="tertiary" onClick={() => setRefineOpen(true)}>
                Add evidence to see fit
              </Button>
            </Box>
          )}
          {(byCompany ? companies.length : visible.length) > shown && (
            <Button
              variant="tertiary"
              size="sm"
              onClick={() => setShown((n) => n + PAGE)}
              style={{ marginTop: 'var(--primitive-space-2)' }}
            >
              Show more ({(byCompany ? companies.length : visible.length) - shown})
            </Button>
          )}
        </Box>
      </AsyncState>
    </Box>
  );
}

function BulkSaveBar({
  picked,
  shown,
  onSave,
}: {
  picked: RankedPosting[];
  /** Unsaved postings on screen. */
  shown: RankedPosting[];
  onSave: (list: RankedPosting[]) => void;
}) {
  return (
    <Stack direction="row" wrap="wrap" gap="tight" align="center">
      {picked.length > 0 && (
        <Button size="sm" variant="primary" onClick={() => onSave(picked)}>
          {`Save ${picked.length} to Pipeline`}
        </Button>
      )}
      <Button
        size="sm"
        variant="secondary"
        disabled={shown.length === 0}
        onClick={() => onSave(shown)}
      >
        {`Save all shown (${shown.length})`}
      </Button>
    </Stack>
  );
}

function CompanyRow({
  g,
  categoryId,
  now,
  unwatched,
  onWatch,
}: {
  g: CompanyGroup;
  categoryId: string;
  now: number;
  /** A board these openings sit on that the track doesn't watch yet. */
  unwatched?: Board;
  onWatch: (b: Board) => void;
}) {
  const newest = postedAgo(g.newestPostedAt, now);
  return (
    <Box
      as="li"
      sx={{
        py: 3,
        borderBottom: 'thin solid',
        borderColor: 'border.default',
        display: 'flex',
        gap: 3,
        alignItems: 'flex-start',
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Text variant="ui" as="h3" style={{ overflowWrap: 'anywhere' }}>
          {g.company}
        </Text>
        <Text
          variant="caption"
          as="span"
          style={{
            color: 'var(--semantic-color-content-secondary)',
            display: 'block',
            marginTop: 'calc(var(--primitive-space-1) * 0.5)',
          }}
        >
          {g.count} {g.count === 1 ? 'opening mentions' : 'openings mention'} your search
          {newest ? ` · newest ${newest}` : ''}
        </Text>
        {g.signals.length > 0 && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1.5 }}>
            {g.signals.map((s) => (
              <Badge key={s.id} tone={s.id === 'contract' ? 'success' : 'info'}>
                {s.label}
              </Badge>
            ))}
          </Box>
        )}
        <Box as="ul" sx={{ listStyle: 'none', m: 0, p: 0, mt: 1.5 }}>
          {g.top.map((p) => (
            <Box as="li" key={p.id}>
              <Text variant="ui" as="span" style={{ overflowWrap: 'anywhere' }}>
                <InlineLink href={p.url} externalIcon={false}>
                  {p.title}
                </InlineLink>
              </Text>
              <Text variant="caption" as="span" style={SECONDARY}>
                {' '}
                · {SOURCE_LABEL[p.source]}
              </Text>
            </Box>
          ))}
        </Box>
      </Box>
      {unwatched && (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => onWatch(unwatched)}
          aria-label={`Watch ${g.company}`}
        >
          Watch
        </Button>
      )}
      <DreamStar categoryId={categoryId} company={g.company} board={g.boards[0]} />
    </Box>
  );
}

function PostingRow({
  p,
  now,
  saved,
  fit,
  onSave,
  picked,
  onPick,
}: {
  p: RankedPosting;
  now: number;
  saved: boolean;
  /** Present once the user has evidence. */
  fit?: FitGap;
  onSave: () => void;
  picked: boolean;
  onPick: () => void;
}) {
  const meta = [
    p.company,
    p.location,
    p.mode && modeLabel(p.mode),
    postedAgo(p.postedAt, now),
    SOURCE_LABEL[p.source],
  ].filter(Boolean);
  return (
    <Box as="li" sx={{ py: 3, borderBottom: 'thin solid', borderColor: 'border.default' }}>
      <Box sx={{ minWidth: 0 }}>
        <Text variant="ui" as="h3" style={{ overflowWrap: 'anywhere' }}>
          <InlineLink href={p.url} externalIcon={false}>
            {p.title}
          </InlineLink>
        </Text>
        <Text
          variant="caption"
          as="span"
          style={{
            color: 'var(--semantic-color-content-secondary)',
            display: 'block',
            marginTop: 'calc(var(--primitive-space-1) * 0.5)',
            overflowWrap: 'anywhere',
          }}
        >
          {meta.join(' · ')}
        </Text>
        {/* Under the meta, not beside it: the title keeps the full row on a phone. 40px target. */}
        <Box sx={{ mt: 'xs' }}>
          <Stack direction="row" gap="tight" align="center" wrap="wrap">
            <Button
              size="md"
              variant={saved ? 'tertiary' : 'secondary'}
              disabled={saved}
              onClick={onSave}
            >
              {saved ? 'Saved' : 'Save'}
            </Button>
            {!saved && (
              <HdsCheckbox
                label="Pick"
                aria-label={`Pick ${p.title}`}
                checked={picked}
                onChange={onPick}
              />
            )}
          </Stack>
        </Box>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1.5 }}>
          {fit && (
            <Badge tone={verdictTone(TIER_INFO[fit.tier].verdict)}>
              {verdictLabel(TIER_INFO[fit.tier].verdict)}
            </Badge>
          )}
          {p.signals.map((s) => (
            <HdsTooltip key={s.id}>
              <HdsTooltip.Trigger asChild>
                <span tabIndex={0}>
                  <Badge tone={s.id === 'contract' ? 'success' : 'info'}>{s.label}</Badge>
                </span>
              </HdsTooltip.Trigger>
              <HdsTooltip.Content>Says “{s.evidence}”</HdsTooltip.Content>
            </HdsTooltip>
          ))}
          <Badge tone="neutral">{p.hit === 'title' ? 'In title' : 'In description'}</Badge>
        </Box>
        {p.snippet && (
          <Text
            variant="ui"
            style={{
              color: 'var(--semantic-color-content-secondary)',
              marginTop: 'calc(var(--primitive-space-1) * 1.5)',
              overflowWrap: 'anywhere',
            }}
          >
            {p.snippet}
          </Text>
        )}
        {fit && (
          <Box sx={{ mt: 'xs' }}>
            <FitGapDetails fg={fit} />
          </Box>
        )}
      </Box>
    </Box>
  );
}
