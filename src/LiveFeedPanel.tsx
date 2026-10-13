// Discover → "Live postings": real openings pulled at view time from public, keyless APIs — Hacker
// News "Who is hiring?", Remotive, and the Greenhouse/Lever/Ashby boards this track watches — then
// phrase-matched and ranked by src/feed/match.ts. Nothing is stored until the user saves a posting,
// which turns it into a tracked Job. Watching a board files a tile on the track (src/feed/watchlist.ts).
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Alert,
  Badge,
  Button,
  Tooltip as HdsTooltip,
  Input as HdsInput,
  SegmentedControl,
  Spinner,
  Tag,
  useToast,
  Box,
  Text,
  InlineLink,
} from '@hirobius/design-system';
import EmptyState from './EmptyState';
import LocationControl from './LocationControl';
import type { WorkMode } from './jobsData';
import { addJobDetailed, dedupKey, useJobs } from './store';
import { fetchFeed, type FeedResult } from './feed/fetchFeed';
import { rankPostings } from './feed/match';
import { postedAgo } from './feed/format';
import { boardsFromUrls } from './feed/sources/ats';
import { watchBoard } from './feed/watchlist';
import { jobFieldsFor } from './feed/toJob';
import { modeLabel } from './screening';
import { SOURCE_LABEL, type RankedPosting, type SignalId } from './feed/types';

type Focus = 'all' | SignalId;
/** Rows rendered per page — the rest sit behind "Show more". */
const PAGE = 40;

interface Loaded {
  term: string;
  boardsKey: string;
  at: number;
  result?: FeedResult;
  error?: string;
}

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

  const boardsKey = boardUrls.join('\n');
  const watchedCount = useMemo(() => boardsFromUrls(boardUrls, Infinity).length, [boardUrls]);

  useEffect(() => {
    if (!term.trim()) return;
    let alive = true;
    fetchFeed({ term, boardUrls: boardsKey ? boardsKey.split('\n') : [] })
      .then((result) => alive && setLoaded({ term, boardsKey, at: Date.now(), result }))
      .catch(
        () =>
          alive &&
          setLoaded({
            term,
            boardsKey,
            at: Date.now(),
            error: 'The feed failed unexpectedly — try searching again.',
          }),
      );
    return () => {
      alive = false;
    };
  }, [term, boardsKey]);

  const current = loaded && loaded.term === term && loaded.boardsKey === boardsKey ? loaded : null;
  const loading = !!term.trim() && !current;

  const ranked = useMemo(
    () =>
      current?.result
        ? rankPostings(current.result.postings, { term, where, mode, now: current.at })
        : [],
    [current, term, where, mode],
  );
  const counts = useMemo(
    () => ({
      contract: ranked.filter((p) => p.signals.some((s) => s.id === 'contract')).length,
      founding: ranked.filter((p) => p.signals.some((s) => s.id === 'founding')).length,
    }),
    [ranked],
  );
  const visible =
    focus === 'all' ? ranked : ranked.filter((p) => p.signals.some((s) => s.id === focus));

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
    if (addJobDetailed(p.url, fields))
      toast({ title: 'Added to Queue', description: fields.label, tone: 'success' });
  };

  const errors = current?.result?.sources.filter((s) => s.error) ?? [];
  const skipped = current?.result?.boardsSkipped ?? 0;

  return (
    <Box>
      <Text
        variant="ui"
        style={{
          color: 'var(--semantic-color-content-secondary)',
          marginBottom: 'calc(var(--primitive-space-1) * 2.5)',
        }}
      >
        Real openings from Hacker News “Who is hiring”, Remotive, and the company boards you watch —
        ranked by fit. Nothing is kept until you save one.
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
            : 'Paste a Greenhouse, Lever or Ashby job-board link to pull that company’s openings in.')}
      </Text>

      {errors.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Alert tone="warning" title="Some sources didn’t respond">
            {errors.map((s) => (
              <Box key={s.key}>{s.error}</Box>
            ))}
          </Alert>
        </Box>
      )}
      {skipped > 0 && (
        <Text
          variant="caption"
          as="span"
          style={{
            color: 'var(--semantic-color-content-secondary)',
            display: 'block',
            marginBottom: 'var(--semantic-space-scale-xs)',
          }}
        >
          {skipped} watched {skipped === 1 ? 'board was' : 'boards were'} skipped — the feed reads
          at most 25 per search.
        </Text>
      )}

      {loading ? (
        <Box
          sx={{ display: 'flex', flexDirection: 'row', gap: 'xs', alignItems: 'center', py: 'md' }}
        >
          <Spinner size="sm" label="Loading live postings" />
          <Text variant="ui" style={{ color: 'var(--semantic-color-content-secondary)' }}>
            Pulling live openings for “{term}”…
          </Text>
        </Box>
      ) : current?.error ? (
        <Alert tone="danger">{current.error}</Alert>
      ) : !term.trim() ? (
        <EmptyState dense message="Type a search term or pick one of this track's terms." />
      ) : ranked.length === 0 ? (
        <EmptyState
          title={`No live openings mention “${term}” right now`}
          message="Hacker News posts a fresh thread monthly and boards change daily — try a broader term, or watch more company boards."
        />
      ) : (
        <Box>
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
                { value: 'contract', label: `Contract-friendly (${counts.contract})` },
                { value: 'founding', label: `First hire (${counts.founding})` },
              ]}
            />
          </Box>
          {visible.length === 0 ? (
            <EmptyState
              dense
              message="None of these openings carry that signal — switch back to All."
            />
          ) : (
            <Box as="ul" sx={{ listStyle: 'none', m: 0, p: 0 }} aria-label="Live postings">
              {visible.slice(0, shown).map((p) => (
                <PostingRow
                  key={p.id}
                  p={p}
                  now={current!.at}
                  saved={savedKeys.has(dedupKey(p.url))}
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
  onSave,
}: {
  p: RankedPosting;
  now: number;
  saved: boolean;
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
