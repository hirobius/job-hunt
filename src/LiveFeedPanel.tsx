// Discover → "Live postings": real openings pulled at view time from public, keyless APIs — Hacker
// News "Who is hiring?", Remotive, the Greenhouse/Lever/Ashby boards this track watches and a starter
// directory of company boards — then phrase-matched and ranked by src/feed/match.ts. With the user's
// evidence, each posting also gets a fit (Role Radar's engine, src/radar/). Nothing is stored until
// the user saves a posting, which turns it into a tracked Job. Watching a board files a tile on the
// track (src/feed/watchlist.ts).
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Alert,
  Badge,
  Button,
  Tooltip as HdsTooltip,
  Input as HdsInput,
  SegmentedControl,
  Checkbox as HdsCheckbox,
  Spinner,
  Stack,
  Tag,
  useToast,
  Box,
  Text,
  InlineLink,
} from '@hirobius/design-system';
import EmptyState from './EmptyState';
import { EvidenceEditor, FitGapDetails, PatternsSummary } from './FeedFit';
import LocationControl from './LocationControl';
import type { WorkMode } from './jobsData';
import { addJobDetailed, dedupKey, updateJob, useJobs } from './store';
import { fetchFeed, type FeedResult } from './feed/fetchFeed';
import { rankPostings } from './feed/match';
import { applyTargeting, NO_TARGETING } from './feed/targeting';
import type { Seniority } from './curation/types';
import { useCategories } from './curation/curationStore';
import { postedAgo } from './feed/format';
import { boardsFromUrls } from './feed/sources/ats';
import { watchBoard } from './feed/watchlist';
import { jobFieldsFor } from './feed/toJob';
import { modeLabel, verdictTone } from './screening';
import { STARTER_DIRECTORY } from './radar/directory';
import { fitGap, parseEvidence, type FitGap } from './radar/fitGap';
import { demandPatterns } from './radar/patterns';
import { readEvidence, TIER_INFO, writeEvidence } from './radar/evidenceStore';
import { SOURCE_LABEL, type RankedPosting, type SignalId } from './feed/types';

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
  where,
  mode,
  onWhere,
  onMode,
}: {
  categoryId: string;
  /** The track's search terms — offered as chips; the first is searched on open. */
  terms: string[];
  /** Every tile URL on the track; the feed pulls the ones that are company boards. */
  boardUrls: string[];
  where: string;
  mode: WorkMode;
  onWhere: (v: string) => void;
  onMode: (v: WorkMode) => void;
}) {
  const { toast } = useToast();
  const [input, setInput] = useState(terms[0] ?? '');
  const [term, setTerm] = useState(terms[0] ?? '');
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [focus, setFocus] = useState<Focus>('all');
  const [shown, setShown] = useState(PAGE);
  const [watchUrl, setWatchUrl] = useState('');
  const [watchError, setWatchError] = useState('');
  const [evidenceText, setEvidenceText] = useState(readEvidence);
  const trackSeniority = useCategories().find((c) => c.id === categoryId)?.seniority ?? 'any';
  const [excludeText, setExcludeText] = useState('');
  const [seniority, setSeniority] = useState<Seniority>(trackSeniority);
  const [floorText, setFloorText] = useState('');
  const [salaryOnly, setSalaryOnly] = useState(false);
  const evidence = useMemo(() => parseEvidence(evidenceText), [evidenceText]);

  // The track's own boards first, then the starter directory (deduped and capped in fetchFeed).
  const boardsKey = [...boardUrls, ...STARTER_DIRECTORY].join('\n');
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
  }, [term, boardsKey]);

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

  const jobs = useJobs();
  const savedKeys = useMemo(() => new Set(jobs.map((j) => dedupKey(j.url))), [jobs]);

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

  const save = (p: RankedPosting) => {
    const fields = jobFieldsFor(p, term);
    const url = addJobDetailed(p.url, fields);
    if (!url) return;
    // The fit rides along, so the Pipeline's Fit column and "Best fit" sort use it.
    const fg = fits.get(p.id);
    if (fg) updateJob(url, { verdict: TIER_INFO[fg.tier].verdict });
    toast({ title: 'Added to Pipeline', description: fields.label, tone: 'success' });
  };

  const errors = current?.result?.sources.filter((s) => s.error) ?? [];
  const allFailed =
    !reading &&
    !!current?.result?.sources.length &&
    errors.length === current.result.sources.length;

  return (
    <Box>
      <Text
        variant="ui"
        style={{
          color: 'var(--semantic-color-content-secondary)',
          marginBottom: 'calc(var(--primitive-space-1) * 2.5)',
        }}
      >
        Real openings from Hacker News “Who is hiring”, Remotive, the company boards you watch and a
        starter list of {STARTER_DIRECTORY.length} more, ranked by relevance. Add your evidence and
        each one gets a fit. Nothing is kept until you save one.
      </Text>
      <LocationControl where={where} mode={mode} onWhere={onWhere} onMode={onMode} />

      <Box
        as="form"
        onSubmit={onSearch}
        sx={{ display: 'flex', gap: 'xs', alignItems: 'flex-end', mb: 'xs' }}
      >
        <Box sx={{ flex: 1, maxWidth: 360, '& > *': { width: '100%' } }}>
          <HdsInput
            size="sm"
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
      </Box>
      <Box sx={{ mb: 'xs', overflowX: 'auto', maxWidth: '100%' }}>
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
      <Box sx={{ mb: 'xs' }}>
        <HdsCheckbox
          label="Only show postings with a salary"
          checked={salaryOnly}
          onChange={() => setSalaryOnly((v) => !v)}
        />
      </Box>
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

      <Box sx={{ mb: 'sm' }}>
        <EvidenceEditor
          text={evidenceText}
          count={evidence.length}
          onChange={(t) => {
            setEvidenceText(t);
            writeEvidence(t);
          }}
        />
      </Box>

      {errors.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Alert tone="warning" title="Some sources didn’t respond">
            {errors.map((s) => (
              <Box key={s.key}>{s.error}</Box>
            ))}
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
          <Text
            variant="caption"
            as="span"
            role="status"
            style={{ color: 'var(--semantic-color-content-secondary)' }}
          >
            Read {reading.done} of {reading.total} boards. More openings may appear.
          </Text>
        </Stack>
      )}

      {loading ? (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'row',
            gap: 'xs',
            alignItems: 'center',
            py: 'md',
          }}
        >
          <Spinner size="sm" label="Loading live postings" />
          <Text variant="ui" style={{ color: 'var(--semantic-color-content-secondary)' }}>
            {reading
              ? `Read ${reading.done} of ${reading.total} boards, nothing matching yet…`
              : `Pulling live openings for “${term}”…`}
          </Text>
        </Box>
      ) : current?.error ? (
        <Alert tone="danger">{current.error}</Alert>
      ) : !term.trim() ? (
        <EmptyState message="Type a search term or pick one of this track's terms." />
      ) : allFailed ? (
        <EmptyState
          title="Couldn't reach any source"
          message="Check your internet connection or try again later."
        />
      ) : ranked.length === 0 && matched.length > 0 ? (
        <EmptyState
          title="Everything is hidden by your filters"
          message="Loosen what you left out, the level or the pay floor to see them again."
        />
      ) : ranked.length === 0 ? (
        <EmptyState
          title={`No live openings mention “${term}” right now`}
          message="Hacker News posts a fresh thread monthly and boards change daily — try a broader term, or watch more company boards."
        />
      ) : (
        <Box>
          <Box sx={{ mb: 'xs' }}>
            <PatternsSummary patterns={patterns} />
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
          {visible.length === 0 ? (
            <EmptyState
              message={
                focus === 'strong'
                  ? 'None is a strong fit for your evidence yet — switch back to All, or add evidence.'
                  : 'None of these openings carry that signal — switch back to All.'
              }
            />
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
                />
              ))}
            </Box>
          )}
          {visible.length > shown && (
            <Button
              variant="tertiary"
              size="sm"
              onClick={() => setShown((n) => n + PAGE)}
              style={{ marginTop: 'var(--primitive-space-2)' }}
            >
              Show more ({visible.length - shown})
            </Button>
          )}
        </Box>
      )}
    </Box>
  );
}

function PostingRow({
  p,
  now,
  saved,
  fit,
  onSave,
}: {
  p: RankedPosting;
  now: number;
  saved: boolean;
  /** Present once the user has evidence. */
  fit?: FitGap;
  onSave: () => void;
}) {
  const meta = [
    p.company,
    p.location,
    p.mode && modeLabel(p.mode),
    postedAgo(p.postedAt, now),
    SOURCE_LABEL[p.source],
  ].filter(Boolean);
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
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1.5 }}>
          {fit && (
            <Badge tone={verdictTone(TIER_INFO[fit.tier].verdict)}>
              {TIER_INFO[fit.tier].label}
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
      <Button
        size="sm"
        variant={saved ? 'tertiary' : 'secondary'}
        disabled={saved}
        onClick={onSave}
      >
        {saved ? 'Saved' : 'Save'}
      </Button>
    </Box>
  );
}
